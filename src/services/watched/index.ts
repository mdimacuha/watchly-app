import 'server-only';

import { db } from '@/db';
import {
  watchedTitles,
  watchlistItems,
  watchlists,
} from '@/db/schema';
import { and, desc, eq, sql } from 'drizzle-orm';
import { tmdbFetch } from '@/server/tmdb/client';
import { mapMovie, mapTv } from '@/server/tmdb/mappers';
import type { MovieCard, TvCard } from '@/server/tmdb/types';
import { invalidateForYouPool } from '@/services/forYou/cacheTag';

export type WatchableMediaType = 'movie' | 'tv';

/**
 * Hybrid "Mark as Watched":
 *   - if the title is already in any of the user's watchlists →
 *     update those rows to status='finished'
 *   - otherwise insert into watched_titles
 *
 * Returns where the watch was recorded so callers can pick the right copy
 * ("Marked as finished in your watchlist" vs "Saved to watched").
 */
export async function markAsWatched(
  userId: string,
  mediaType: WatchableMediaType,
  mediaId: string,
): Promise<'watchlist_finished' | 'watched_table'> {
  // Look up matching watchlist items the user owns.
  const itemRows = await db
    .select({ id: watchlistItems.id })
    .from(watchlistItems)
    .innerJoin(watchlists, eq(watchlists.id, watchlistItems.watchlistId))
    .where(
      and(
        eq(watchlists.userId, userId),
        eq(watchlistItems.mediaType, mediaType),
        eq(watchlistItems.mediaId, mediaId),
      ),
    );

  if (itemRows.length > 0) {
    // Flip every matching row to finished + stamp finishedAt. Sets
    // started_at if it wasn't already set, mirroring updateItemStatus.
    const now = new Date();
    await db
      .update(watchlistItems)
      .set({
        status: 'finished',
        finishedAt: now,
        // Use COALESCE so existing started_at values are preserved.
        startedAt: sql`COALESCE(${watchlistItems.startedAt}, ${now})`,
        updatedAt: now,
      })
      .where(
        sql`${watchlistItems.id} IN (${sql.join(
          itemRows.map((r) => sql`${r.id}`),
          sql`, `,
        )})`,
      );
    invalidateForYouPool(userId);
    return 'watchlist_finished';
  }

  // Not in a watchlist — record in the dedicated table. Idempotent via
  // composite PK (userId, mediaType, mediaId).
  await db
    .insert(watchedTitles)
    .values({ userId, mediaType, mediaId })
    .onConflictDoNothing();
  invalidateForYouPool(userId);
  return 'watched_table';
}

/**
 * Set of `${mediaType}:${tmdbId}` keys representing "the user has
 * watched this." Pulls from BOTH:
 *   - watched_titles
 *   - watchlist_items where status='finished'
 *
 * Used by For You's excludeSet so finished/watched titles don't appear
 * in recommendations.
 */
export async function getWatchedKeySet(userId: string): Promise<Set<string>> {
  const set = new Set<string>();

  const [watched, finished] = await Promise.all([
    db
      .select({
        mediaType: watchedTitles.mediaType,
        mediaId: watchedTitles.mediaId,
      })
      .from(watchedTitles)
      .where(eq(watchedTitles.userId, userId)),
    db
      .select({
        mediaType: watchlistItems.mediaType,
        mediaId: watchlistItems.mediaId,
      })
      .from(watchlistItems)
      .innerJoin(watchlists, eq(watchlists.id, watchlistItems.watchlistId))
      .where(
        and(
          eq(watchlists.userId, userId),
          eq(watchlistItems.status, 'finished'),
        ),
      ),
  ]);

  for (const r of watched) set.add(`${r.mediaType}:${r.mediaId}`);
  for (const r of finished) set.add(`${r.mediaType}:${r.mediaId}`);
  return set;
}

// ---------------------------------------------------------------------------
// Watched count + listing (used by profile surfaces)
// ---------------------------------------------------------------------------

export interface WatchedEntry {
  mediaType: WatchableMediaType;
  mediaId: string;
  /** Latest watch timestamp across both data sources for this (type, id). */
  watchedAt: Date;
}

/**
 * Pulls the user's full watched-titles set, merging:
 *   - watched_titles (explicit Mark as Watched)
 *   - watchlist_items where status='finished' (watchlist completions)
 *
 * Deduped by (mediaType, mediaId) — when a title appears in both sources
 * the latest timestamp wins, so the profile grid shows it where the
 * user last interacted. Sorted by `watchedAt DESC` so the freshest
 * watches lead the page.
 */
export async function getWatchedEntries(
  userId: string,
): Promise<WatchedEntry[]> {
  const [watched, finished] = await Promise.all([
    db
      .select({
        mediaType: watchedTitles.mediaType,
        mediaId: watchedTitles.mediaId,
        watchedAt: watchedTitles.watchedAt,
      })
      .from(watchedTitles)
      .where(eq(watchedTitles.userId, userId)),
    db
      .select({
        mediaType: watchlistItems.mediaType,
        mediaId: watchlistItems.mediaId,
        finishedAt: watchlistItems.finishedAt,
      })
      .from(watchlistItems)
      .innerJoin(watchlists, eq(watchlists.id, watchlistItems.watchlistId))
      .where(
        and(
          eq(watchlists.userId, userId),
          eq(watchlistItems.status, 'finished'),
        ),
      ),
  ]);

  // Merge into a Map keyed by `${type}:${id}` so the same title appearing
  // in both sources collapses to one row with the max(watchedAt).
  const merged = new Map<string, WatchedEntry>();

  const add = (mediaType: WatchableMediaType, mediaId: string, ts: Date | null) => {
    if (!ts) return;
    const key = `${mediaType}:${mediaId}`;
    const existing = merged.get(key);
    if (!existing || ts > existing.watchedAt) {
      merged.set(key, { mediaType, mediaId, watchedAt: ts });
    }
  };

  for (const r of watched) {
    if (r.mediaType === 'movie' || r.mediaType === 'tv') {
      add(r.mediaType, r.mediaId, r.watchedAt);
    }
  }
  for (const r of finished) {
    if (r.mediaType === 'movie' || r.mediaType === 'tv') {
      add(r.mediaType, r.mediaId, r.finishedAt);
    }
  }

  return Array.from(merged.values()).sort(
    (a, b) => b.watchedAt.getTime() - a.watchedAt.getTime(),
  );
}

export async function getWatchedCount(userId: string): Promise<number> {
  // Smaller than the entries call (no timestamps) — but the merge logic
  // is the same since count() over a UNION would double-count titles
  // present in both sources.
  const keys = await getWatchedKeySet(userId);
  return keys.size;
}

// ---------------------------------------------------------------------------
// Enriched (TMDB-hydrated) listing for the profile grids
// ---------------------------------------------------------------------------

export type EnrichedWatched =
  | { mediaType: 'movie'; mediaId: string; watchedAt: string; data: MovieCard }
  | { mediaType: 'tv'; mediaId: string; watchedAt: string; data: TvCard };

/**
 * Returns the watched list with TMDB poster/title data attached, ready
 * to render in a poster grid. Limits to `take` rows (default 60) to keep
 * the TMDB fan-out bounded — pagination can come later if profiles
 * regularly exceed this.
 *
 * Per-row TMDB errors drop the entry rather than failing the whole
 * call: better to show 59 of 60 than to flash an error on the profile.
 */
export async function getEnrichedWatched(
  userId: string,
  opts: { take?: number } = {},
): Promise<EnrichedWatched[]> {
  const take = opts.take ?? 60;
  const entries = (await getWatchedEntries(userId)).slice(0, take);
  if (entries.length === 0) return [];

  const hydrated = await Promise.all(
    entries.map(async (e): Promise<EnrichedWatched | null> => {
      try {
        if (e.mediaType === 'movie') {
          const raw = await tmdbFetch<unknown>(`/movie/${e.mediaId}`);
          return {
            mediaType: 'movie',
            mediaId: e.mediaId,
            watchedAt: e.watchedAt.toISOString(),
            data: mapMovie({
              ...(raw as Record<string, unknown>),
              media_type: 'movie',
            }),
          };
        }
        const raw = await tmdbFetch<unknown>(`/tv/${e.mediaId}`);
        return {
          mediaType: 'tv',
          mediaId: e.mediaId,
          watchedAt: e.watchedAt.toISOString(),
          data: mapTv({
            ...(raw as Record<string, unknown>),
            media_type: 'tv',
          }),
        };
      } catch {
        return null;
      }
    }),
  );

  return hydrated.filter((r): r is EnrichedWatched => r !== null);
}

// ---------------------------------------------------------------------------
// Unwatch — reverses both halves of the hybrid model
// ---------------------------------------------------------------------------

/**
 * Reverses `markAsWatched`:
 *   - deletes any watched_titles row for this (user, mediaType, mediaId)
 *   - flips any finished watchlist items back to 'watching' and clears
 *     finishedAt so the title leaves the user's watched set entirely.
 *
 * Idempotent: safe to call even if nothing matches.
 */
export async function unmarkWatched(
  userId: string,
  mediaType: WatchableMediaType,
  mediaId: string,
): Promise<void> {
  // Pull matching watchlist items first so we know if anything needs
  // flipping (avoids a no-op UPDATE that still hits the table).
  const matchingItems = await db
    .select({ id: watchlistItems.id })
    .from(watchlistItems)
    .innerJoin(watchlists, eq(watchlists.id, watchlistItems.watchlistId))
    .where(
      and(
        eq(watchlists.userId, userId),
        eq(watchlistItems.mediaType, mediaType),
        eq(watchlistItems.mediaId, mediaId),
        eq(watchlistItems.status, 'finished'),
      ),
    );

  const ops: Promise<unknown>[] = [
    db
      .delete(watchedTitles)
      .where(
        and(
          eq(watchedTitles.userId, userId),
          eq(watchedTitles.mediaType, mediaType),
          eq(watchedTitles.mediaId, mediaId),
        ),
      ),
  ];

  if (matchingItems.length > 0) {
    ops.push(
      db
        .update(watchlistItems)
        .set({
          status: 'watching',
          finishedAt: null,
          updatedAt: new Date(),
        })
        .where(
          sql`${watchlistItems.id} IN (${sql.join(
            matchingItems.map((r) => sql`${r.id}`),
            sql`, `,
          )})`,
        ),
    );
  }

  await Promise.all(ops);
  invalidateForYouPool(userId);
}

// Suppress lint warning for unused desc import — kept for future
// query-level ordering if we move sort to SQL.
void desc;
