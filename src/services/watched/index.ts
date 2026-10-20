import 'server-only';

import { db } from '@/db';
import {
  watchedTitles,
  watchlistItems,
  watchlists,
} from '@/db/schema';
import { and, desc, eq, inArray, notInArray, sql } from 'drizzle-orm';
import { tmdbFetch } from '@/server/tmdb/client';
import { mapMovie, mapTv } from '@/server/tmdb/mappers';
import type { MovieCard, TvCard } from '@/server/tmdb/types';
import { revalidateTag, unstable_cache } from 'next/cache';
import { NotFoundAppError, ValidationAppError } from '@/utils/errors';
import { invalidateForYouPool, libraryTag } from '@/services/forYou/cacheTag';
import { WATCHED_STATUSES } from '@/services/watchlists/validators';
import { WATCHED_PAGE_SIZE, compareWatched, seenOnToDate, type WatchedPrecision } from '@/lib/watchedDates';

export type { WatchedPrecision };

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
 *   - watchlist_items with a watched status (finished / rewatch)
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
          inArray(watchlistItems.status, [...WATCHED_STATUSES]),
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
  /**
   * When it was seen: the member's own date when they set one (month/year
   * dates sit on the 1st of the period), otherwise the latest watch
   * timestamp across both sources. For 'unknown' it's the logged time, only
   * used as a stable tiebreak.
   */
  watchedAt: Date;
  precision: WatchedPrecision;
  /** True when the member set the date by hand (it's no longer just the logged time). */
  confirmed: boolean;
}

/**
 * Pulls the user's full watched-titles set, merging:
 *   - watched_titles (explicit Mark as Watched, reviews, dates set by hand)
 *   - watchlist_items with a watched status (finished / rewatch); rewatch
 *     rows without a finishedAt fall back to their updatedAt
 *
 * Deduped by (mediaType, mediaId). A date the member set by hand
 * (seen_precision not null) always wins; otherwise the latest timestamp
 * across both sources does, so the grid shows it where the user last
 * interacted. Sorted with `compareWatched`.
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
        seenOn: watchedTitles.seenOn,
        seenPrecision: watchedTitles.seenPrecision,
      })
      .from(watchedTitles)
      .where(eq(watchedTitles.userId, userId)),
    db
      .select({
        mediaType: watchlistItems.mediaType,
        mediaId: watchlistItems.mediaId,
        finishedAt: sql<Date>`coalesce(${watchlistItems.finishedAt}, ${watchlistItems.updatedAt})`.mapWith(
          (v: string | Date) => new Date(v),
        ),
      })
      .from(watchlistItems)
      .innerJoin(watchlists, eq(watchlists.id, watchlistItems.watchlistId))
      .where(
        and(
          eq(watchlists.userId, userId),
          inArray(watchlistItems.status, [...WATCHED_STATUSES]),
        ),
      ),
  ]);

  // Merge into a Map keyed by `${type}:${id}`: a hand-set date is final,
  // otherwise the same title in both sources collapses to max(watchedAt).
  const merged = new Map<string, WatchedEntry>();
  const fixed = new Set<string>();

  for (const r of watched) {
    if (r.mediaType !== 'movie' && r.mediaType !== 'tv') continue;
    const key = `${r.mediaType}:${r.mediaId}`;
    if (r.seenPrecision) {
      fixed.add(key);
      merged.set(key, {
        mediaType: r.mediaType,
        mediaId: r.mediaId,
        watchedAt: r.seenOn && r.seenPrecision !== 'unknown' ? seenOnToDate(r.seenOn) : r.watchedAt,
        precision: r.seenOn ? r.seenPrecision : 'unknown',
        confirmed: true,
      });
    } else {
      merged.set(key, { mediaType: r.mediaType, mediaId: r.mediaId, watchedAt: r.watchedAt, precision: 'day', confirmed: false });
    }
  }
  for (const r of finished) {
    if (r.mediaType !== 'movie' && r.mediaType !== 'tv') continue;
    const key = `${r.mediaType}:${r.mediaId}`;
    if (fixed.has(key) || !r.finishedAt) continue;
    const existing = merged.get(key);
    if (!existing || r.finishedAt > existing.watchedAt) {
      merged.set(key, { mediaType: r.mediaType, mediaId: r.mediaId, watchedAt: r.finishedAt, precision: 'day', confirmed: false });
    }
  }

  return Array.from(merged.values()).sort(compareWatched);
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

interface EnrichedWatchedBase {
  mediaId: string;
  watchedAt: string;
  precision: WatchedPrecision;
  confirmed: boolean;
  /** Ticket number: 1 = the earliest dated watch. Null while undated. */
  serial: number | null;
}

export type EnrichedWatched =
  | (EnrichedWatchedBase & { mediaType: 'movie'; data: MovieCard })
  | (EnrichedWatchedBase & { mediaType: 'tv'; data: TvCard });

export { WATCHED_PAGE_SIZE };

/**
 * Returns a page of the watched list (newest first) with TMDB poster/title
 * data attached, ready to render as ticket stubs. `take` rows from
 * `offset` keep the TMDB fan-out bounded; "Show more" asks for the next.
 *
 * Per-row TMDB errors drop the entry rather than failing the whole
 * call: better to show 59 of 60 than to flash an error on the profile.
 *
 * Cached per user (every profile view needs it; building it is `take` TMDB
 * reads). Tagged with the library tag, which mark/unmark-watched and list
 * writes bust. A build that lost rows to a TMDB error is returned but not cached,
 * so a transient failure doesn't hide titles for the whole TTL.
 */
export async function getEnrichedWatched(
  userId: string,
  opts: { take?: number; offset?: number } = {},
): Promise<EnrichedWatched[]> {
  const take = opts.take ?? WATCHED_PAGE_SIZE;
  const offset = opts.offset ?? 0;
  const cached = unstable_cache(
    async () => {
      const { items, failed } = await enrichWatched(userId, offset, take);
      if (failed > 0) throw new PartialWatchedError(items);
      return items;
    },
    // v3: entries gained precision + serial (seen dates, migration 0041), so
    // lists cached by the previous deploy are dropped.
    ['watched-enriched-v3', userId, String(offset), String(take)],
    { revalidate: ENRICHED_WATCHED_REVALIDATE_SECONDS, tags: [libraryTag(userId)] },
  );
  try {
    return await cached();
  } catch (err) {
    if (err instanceof PartialWatchedError) return err.items;
    throw err;
  }
}

const ENRICHED_WATCHED_REVALIDATE_SECONDS = 3600;

class PartialWatchedError extends Error {
  constructor(readonly items: EnrichedWatched[]) {
    super('partial watched enrichment');
  }
}

async function enrichWatched(
  userId: string,
  offset: number,
  take: number,
): Promise<{ items: EnrichedWatched[]; failed: number }> {
  const all = await getWatchedEntries(userId);
  // Ticket numbers run through the whole history (oldest dated = 1); the
  // list is newest first with undated entries last, so dated index i has
  // serial datedTotal - i.
  const datedTotal = all.filter((e) => e.precision !== 'unknown').length;
  const entries = all.slice(offset, offset + take);
  if (entries.length === 0) return { items: [], failed: 0 };

  const hydrated = await Promise.all(
    entries.map(async (e, i): Promise<EnrichedWatched | null> => {
      const base = {
        mediaId: e.mediaId,
        watchedAt: e.watchedAt.toISOString(),
        precision: e.precision,
        confirmed: e.confirmed,
        serial: e.precision === 'unknown' ? null : datedTotal - (offset + i),
      };
      try {
        if (e.mediaType === 'movie') {
          const raw = await tmdbFetch<unknown>(`/movie/${e.mediaId}`);
          return {
            ...base,
            mediaType: 'movie',
            data: mapMovie({
              ...(raw as Record<string, unknown>),
              media_type: 'movie',
            }),
          };
        }
        const raw = await tmdbFetch<unknown>(`/tv/${e.mediaId}`);
        return {
          ...base,
          mediaType: 'tv',
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

  const items = hydrated.filter((r): r is EnrichedWatched => r !== null);
  return { items, failed: hydrated.length - items.length };
}

// ---------------------------------------------------------------------------
// Reviews count as watches
// ---------------------------------------------------------------------------

/**
 * Records a first review as a watch. Unlike `markAsWatched` it only touches
 * watched_titles: a TV review mid-season shouldn't flip a "Watching" list
 * item to finished. The review flow offers that as a separate nudge (see
 * `getUnfinishedListItems`). Idempotent; an existing watch keeps its date.
 */
export async function recordReviewWatch(
  userId: string,
  mediaType: WatchableMediaType,
  mediaId: string,
): Promise<void> {
  await db
    .insert(watchedTitles)
    .values({ userId, mediaType, mediaId, source: 'review' })
    .onConflictDoNothing();
  invalidateForYouPool(userId);
}

export interface UnfinishedListItem {
  itemId: string;
  watchlistId: string;
  watchlistName: string;
}

/** The user's list items for a title that aren't in a watched status yet. */
export async function getUnfinishedListItems(
  userId: string,
  mediaType: WatchableMediaType,
  mediaId: string,
): Promise<UnfinishedListItem[]> {
  return db
    .select({
      itemId: watchlistItems.id,
      watchlistId: watchlists.id,
      watchlistName: watchlists.name,
    })
    .from(watchlistItems)
    .innerJoin(watchlists, eq(watchlists.id, watchlistItems.watchlistId))
    .where(
      and(
        eq(watchlists.userId, userId),
        eq(watchlistItems.mediaType, mediaType),
        eq(watchlistItems.mediaId, mediaId),
        notInArray(watchlistItems.status, [...WATCHED_STATUSES]),
      ),
    );
}

// ---------------------------------------------------------------------------
// Unwatch — reverses both halves of the hybrid model
// ---------------------------------------------------------------------------

/**
 * Reverses `markAsWatched`:
 *   - deletes any watched_titles row for this (user, mediaType, mediaId)
 *   - flips any watched (finished / rewatch) items back to 'watching' and clears
 *     finishedAt so the title leaves the user's watched set entirely.
 *
 * Idempotent: safe to call even if nothing matches. Returns what it undid,
 * so `restoreWatched` can put it back exactly (the "Undo" toast).
 */
export async function unmarkWatched(
  userId: string,
  mediaType: WatchableMediaType,
  mediaId: string,
): Promise<UnwatchSnapshot> {
  // Pull matching watchlist items first so we know if anything needs
  // flipping (avoids a no-op UPDATE that still hits the table).
  const matchingItems = await db
    .select({ id: watchlistItems.id, status: watchlistItems.status, finishedAt: watchlistItems.finishedAt })
    .from(watchlistItems)
    .innerJoin(watchlists, eq(watchlists.id, watchlistItems.watchlistId))
    .where(
      and(
        eq(watchlists.userId, userId),
        eq(watchlistItems.mediaType, mediaType),
        eq(watchlistItems.mediaId, mediaId),
        inArray(watchlistItems.status, [...WATCHED_STATUSES]),
      ),
    );

  const deletedP = db
    .delete(watchedTitles)
    .where(
      and(
        eq(watchedTitles.userId, userId),
        eq(watchedTitles.mediaType, mediaType),
        eq(watchedTitles.mediaId, mediaId),
      ),
    )
    .returning({
      watchedAt: watchedTitles.watchedAt,
      seenOn: watchedTitles.seenOn,
      seenPrecision: watchedTitles.seenPrecision,
      source: watchedTitles.source,
    });
  const ops: Promise<unknown>[] = [deletedP];

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
  const [deleted] = await deletedP;
  return {
    watchedAt: deleted?.watchedAt.toISOString() ?? null,
    seen: deleted ? { seenOn: deleted.seenOn, seenPrecision: deleted.seenPrecision, source: deleted.source } : null,
    items: matchingItems.map((i) => ({
      id: i.id,
      status: i.status as (typeof WATCHED_STATUSES)[number],
      finishedAt: i.finishedAt?.toISOString() ?? null,
    })),
  };
}

export interface UnwatchSnapshot {
  /** The watched_titles row's date, or null when there was none. */
  watchedAt: string | null;
  /** The row's seen date + source, restored with it. */
  seen: SeenState | null;
  /** List items that were in a watched status, as they were. */
  items: { id: string; status: (typeof WATCHED_STATUSES)[number]; finishedAt: string | null }[];
}

/**
 * Undoes `unmarkWatched` from its snapshot: re-inserts the watched row with
 * its original date and puts each list item back in its old status. Items
 * are owner-gated, so a tampered snapshot can only touch the user's own rows.
 */
export async function restoreWatched(
  userId: string,
  mediaType: WatchableMediaType,
  mediaId: string,
  snapshot: UnwatchSnapshot,
): Promise<void> {
  const ownItems = sql`${watchlistItems.watchlistId} IN (SELECT ${watchlists.id} FROM ${watchlists} WHERE ${watchlists.userId} = ${userId})`;
  await Promise.all([
    snapshot.watchedAt
      ? db
          .insert(watchedTitles)
          .values({ userId, mediaType, mediaId, watchedAt: new Date(snapshot.watchedAt), ...(snapshot.seen ?? {}) })
          .onConflictDoNothing()
      : Promise.resolve(),
    ...snapshot.items.map((i) =>
      db
        .update(watchlistItems)
        .set({
          status: i.status,
          finishedAt: i.finishedAt ? new Date(i.finishedAt) : null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(watchlistItems.id, i.id),
            eq(watchlistItems.mediaType, mediaType),
            eq(watchlistItems.mediaId, mediaId),
            ownItems,
          ),
        ),
    ),
  ]);
  invalidateForYouPool(userId);
}

// ---------------------------------------------------------------------------
// "Seen it" — logging a watch from anywhere, with an exact undo
// ---------------------------------------------------------------------------

/** Past watches a member can log per rolling day (Log a watch / search). */
export const BACKFILL_DAILY_LIMIT = 50;

/** What `logWatch` changed, so `restoreLogWatch` can put it all back. */
export interface LogWatchSnapshot {
  /** True when logWatch inserted the watched row (undo deletes it). */
  createdRow: boolean;
  /** List items it moved to finished, as they were before. */
  items: { id: string; status: string; finishedAt: string | null; startedAt: string | null }[];
}

/**
 * Marks a title watched: finishes it in any of the member's lists (as Mark as
 * watched always has) and makes sure a watched row exists, dated `seen` when
 * given. `source` is 'backfill' for past watches logged from Log a watch or
 * search, which count against BACKFILL_DAILY_LIMIT. A title that was already
 * watched is left as it is (`already: true`).
 */
export async function logWatch(
  userId: string,
  mediaType: WatchableMediaType,
  mediaId: string,
  seen: { date: string | null; precision: WatchedPrecision } | null,
  source: 'mark' | 'backfill',
): Promise<{ already: boolean; snapshot: LogWatchSnapshot }> {
  const key = `${mediaType}:${mediaId}`;
  if ((await getWatchedKeySet(userId)).has(key)) {
    return { already: true, snapshot: { createdRow: false, items: [] } };
  }

  if (source === 'backfill') {
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(watchedTitles)
      .where(
        and(
          eq(watchedTitles.userId, userId),
          eq(watchedTitles.source, 'backfill'),
          sql`${watchedTitles.watchedAt} > now() - interval '24 hours'`,
        ),
      );
    if (n >= BACKFILL_DAILY_LIMIT) {
      throw new ValidationAppError(
        `You've logged ${BACKFILL_DAILY_LIMIT} past watches today. You can log more tomorrow.`,
      );
    }
  }

  const items = await db
    .select({
      id: watchlistItems.id,
      status: watchlistItems.status,
      finishedAt: watchlistItems.finishedAt,
      startedAt: watchlistItems.startedAt,
    })
    .from(watchlistItems)
    .innerJoin(watchlists, eq(watchlists.id, watchlistItems.watchlistId))
    .where(
      and(
        eq(watchlists.userId, userId),
        eq(watchlistItems.mediaType, mediaType),
        eq(watchlistItems.mediaId, mediaId),
        notInArray(watchlistItems.status, [...WATCHED_STATUSES]),
      ),
    );

  const now = new Date();
  const seenOn = seen && seen.precision !== 'unknown' ? seen.date : null;
  const [created] = await Promise.all([
    db
      .insert(watchedTitles)
      .values({
        userId,
        mediaType,
        mediaId,
        source,
        ...(seen ? { seenOn, seenPrecision: seen.precision } : {}),
      })
      .onConflictDoNothing()
      .returning({ mediaId: watchedTitles.mediaId }),
    items.length > 0
      ? db
          .update(watchlistItems)
          .set({
            status: 'finished',
            finishedAt: now,
            startedAt: sql`COALESCE(${watchlistItems.startedAt}, ${now})`,
            updatedAt: now,
          })
          .where(inArray(watchlistItems.id, items.map((i) => i.id)))
      : Promise.resolve(),
  ]);
  invalidateForYouPool(userId);

  return {
    already: false,
    snapshot: {
      createdRow: created.length > 0,
      items: items.map((i) => ({
        id: i.id,
        status: i.status,
        finishedAt: i.finishedAt?.toISOString() ?? null,
        startedAt: i.startedAt?.toISOString() ?? null,
      })),
    },
  };
}

/** Undoes `logWatch`: drops the row it created and puts list items back. Owner-gated. */
export async function restoreLogWatch(
  userId: string,
  mediaType: WatchableMediaType,
  mediaId: string,
  snapshot: LogWatchSnapshot,
): Promise<void> {
  const ownItems = sql`${watchlistItems.watchlistId} IN (SELECT ${watchlists.id} FROM ${watchlists} WHERE ${watchlists.userId} = ${userId})`;
  await Promise.all([
    snapshot.createdRow
      ? db
          .delete(watchedTitles)
          .where(
            and(
              eq(watchedTitles.userId, userId),
              eq(watchedTitles.mediaType, mediaType),
              eq(watchedTitles.mediaId, mediaId),
            ),
          )
      : Promise.resolve(),
    ...snapshot.items.map((i) =>
      db
        .update(watchlistItems)
        .set({
          status: i.status as typeof watchlistItems.$inferSelect.status,
          finishedAt: i.finishedAt ? new Date(i.finishedAt) : null,
          startedAt: i.startedAt ? new Date(i.startedAt) : null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(watchlistItems.id, i.id),
            eq(watchlistItems.mediaType, mediaType),
            eq(watchlistItems.mediaId, mediaId),
            ownItems,
          ),
        ),
    ),
  ]);
  invalidateForYouPool(userId);
}

/** The viewer's watch of one title, for "Seen it" buttons: null when unwatched. */
export async function getWatchOf(
  userId: string,
  mediaType: WatchableMediaType,
  mediaId: string,
): Promise<Pick<WatchedEntry, 'precision' | 'confirmed'> & { watchedAt: string } | null> {
  const entry = (await getWatchedEntries(userId)).find((e) => e.mediaType === mediaType && e.mediaId === mediaId);
  return entry ? { watchedAt: entry.watchedAt.toISOString(), precision: entry.precision, confirmed: entry.confirmed } : null;
}

// ---------------------------------------------------------------------------
// Seen dates — the member's own "when did you see it"
// ---------------------------------------------------------------------------

/** A watched row's hand-set date and where the row came from. */
export interface SeenState {
  seenOn: string | null;
  seenPrecision: WatchedPrecision | null;
  source: 'mark' | 'review' | 'edited' | 'backfill';
}

/** What `setSeenDate` replaced; `existed: false` means it created the row. */
export type SeenSnapshot = { existed: false } | { existed: true; state: SeenState };

/**
 * Sets when the member saw a title they've watched. `date` is 'YYYY-MM-DD'
 * on the 1st of the period for month/year precision, and null for
 * 'unknown'. The row is created when the title is only watched through a
 * finished list item: list items are never rewritten, the row just wins in
 * the merge. Callers validate the date; this checks the title is watched.
 */
export async function setSeenDate(
  userId: string,
  mediaType: WatchableMediaType,
  mediaId: string,
  seen: { date: string | null; precision: WatchedPrecision },
): Promise<SeenSnapshot> {
  const keys = await getWatchedKeySet(userId);
  if (!keys.has(`${mediaType}:${mediaId}`)) throw new NotFoundAppError('Not in your watched titles');

  const where = and(
    eq(watchedTitles.userId, userId),
    eq(watchedTitles.mediaType, mediaType),
    eq(watchedTitles.mediaId, mediaId),
  );
  const [prev] = await db
    .select({ seenOn: watchedTitles.seenOn, seenPrecision: watchedTitles.seenPrecision, source: watchedTitles.source })
    .from(watchedTitles)
    .where(where)
    .limit(1);

  const seenOn = seen.precision === 'unknown' ? null : seen.date;
  await db
    .insert(watchedTitles)
    .values({ userId, mediaType, mediaId, seenOn, seenPrecision: seen.precision, source: 'edited' })
    .onConflictDoUpdate({
      target: [watchedTitles.userId, watchedTitles.mediaType, watchedTitles.mediaId],
      set: { seenOn, seenPrecision: seen.precision, source: 'edited' },
    });
  revalidateTag(libraryTag(userId), { expire: 0 });
  return prev ? { existed: true, state: prev } : { existed: false };
}

/** Undoes `setSeenDate`: puts the old date back, or drops the row it created. */
export async function restoreSeenDate(
  userId: string,
  mediaType: WatchableMediaType,
  mediaId: string,
  snapshot: SeenSnapshot,
): Promise<void> {
  const where = and(
    eq(watchedTitles.userId, userId),
    eq(watchedTitles.mediaType, mediaType),
    eq(watchedTitles.mediaId, mediaId),
  );
  if (snapshot.existed) {
    await db.update(watchedTitles).set(snapshot.state).where(where);
  } else {
    // Only the row setSeenDate made: still hand-dated, never a real mark.
    await db.delete(watchedTitles).where(and(where, eq(watchedTitles.source, 'edited')));
  }
  revalidateTag(libraryTag(userId), { expire: 0 });
}

// Suppress lint warning for unused desc import — kept for future
// query-level ordering if we move sort to SQL.
void desc;
