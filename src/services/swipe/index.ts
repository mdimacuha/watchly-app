import 'server-only';

import { db } from '@/db';
import { titleSwipeEvents, titleSwipes } from '@/db/schema';
import { and, desc, eq, inArray, lt } from 'drizzle-orm';
import { addFavorite, removeFavorite } from '@/services/favorites';
import { staleForYouPool } from '@/services/forYou/cacheTag';
import { tmdbFetch } from '@/server/tmdb/client';
import { mapWithConcurrency } from '@/lib/concurrency';
import { logger } from '@/lib/log';
import type { SwipeAction, SwipeSource, TitleType } from './constants';

export type { SwipeAction, SwipeSource, TitleType } from './constants';
export { DECIDED_SWIPE_ACTIONS } from './constants';

// Re-export the deck recommendation entry-point so callers can use one
// import (`@/services/swipe`) for both record + read paths.
export { getSwipeDeck, type SwipeDeckItem } from './recommendation';

interface RecordSwipeInput {
  userId: string;
  tmdbId: number;
  mediaType: TitleType;
  action: SwipeAction;
  source?: SwipeSource;
  scoreSnapshot?: number;
  metadata?: Record<string, unknown>;
}

interface RecordSwipeResult {
  /** Id of the (upserted) title_swipes row — the handle single-step undo
   *  deletes. Present on both fresh inserts and conflict-updates. */
  swipeId: string;
  titleId: string;
  titleType: TitleType;
  action: SwipeAction;
  /** True when a Favorites row was created (saved action, first time). */
  favoriteAdded: boolean;
}

/**
 * Records a user's swipe on a single title. Upserts by
 * (userId, titleId, titleType) so changing your mind (e.g. liked → saved)
 * overwrites the prior row.
 *
 * Side effect: when `action === 'saved'`, also writes to userFavorites
 * via the existing `addFavorite` service. That carries the verification
 * gate + activity recording for free, so a swipe-Save behaves identically
 * to a heart tap on the title page.
 *
 * Liked / passed / opened swipes are stored only — they don't bleed
 * into Favorites. That separation is the whole point of the feature:
 * Favorites stay clean while we still capture taste signals.
 */
export async function recordSwipe(
  input: RecordSwipeInput,
): Promise<RecordSwipeResult> {
  const titleId = String(input.tmdbId);
  const titleType = input.mediaType;

  const [swipe] = await db
    .insert(titleSwipes)
    .values({
      userId: input.userId,
      titleId,
      titleType,
      action: input.action,
      source: input.source ?? 'swipe_discovery',
      // numeric columns accept string (Drizzle quirk for arbitrary precision)
      scoreSnapshot:
        input.scoreSnapshot !== undefined ? String(input.scoreSnapshot) : null,
      metadata: input.metadata ?? null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        titleSwipes.userId,
        titleSwipes.titleId,
        titleSwipes.titleType,
      ],
      set: {
        action: input.action,
        source: input.source ?? 'swipe_discovery',
        scoreSnapshot:
          input.scoreSnapshot !== undefined
            ? String(input.scoreSnapshot)
            : null,
        metadata: input.metadata ?? null,
        updatedAt: new Date(),
      },
    })
    // RETURNING fires on both the insert and the conflict-update path, so the
    // swipe id is always available for the single-step undo handle.
    .returning({ id: titleSwipes.id });
  staleForYouPool(input.userId);

  await logSwipeEvent({
    userId: input.userId,
    titleId,
    titleType,
    event: input.action,
    source: input.source,
    scoreSnapshot: input.scoreSnapshot,
    metadata: input.metadata,
  });

  let favoriteAdded = false;
  if (input.action === 'saved') {
    const row = await addFavorite(input.userId, titleId, titleType);
    favoriteAdded = Boolean(row);
  }

  return {
    swipeId: swipe.id,
    titleId,
    titleType,
    action: input.action,
    favoriteAdded,
  };
}

// ---------------------------------------------------------------------------
// Undo (single-step)
// ---------------------------------------------------------------------------

/**
 * Deletes one swipe row, scoped to the owning user so a stray id from
 * another account can't be removed. Returns true when a row was deleted.
 *
 * When `reverseFavorite` is supplied, the Favorites row for the same title
 * is removed too — but ONLY the caller decides when that's safe. The deck
 * threads the `favoriteAdded` flag recordSwipe returned, so a pre-existing
 * favorite (one the swipe didn't create) is never touched by an undo.
 */
export async function deleteSwipe(
  userId: string,
  swipeId: string,
  opts?: { reverseFavorite?: { titleId: string; titleType: TitleType } },
): Promise<boolean> {
  const deleted = await db
    .delete(titleSwipes)
    .where(and(eq(titleSwipes.id, swipeId), eq(titleSwipes.userId, userId)))
    .returning({ id: titleSwipes.id, titleId: titleSwipes.titleId, titleType: titleSwipes.titleType });

  const removed = deleted.length > 0;
  if (removed) {
    staleForYouPool(userId);
    await logSwipeEvent({
      userId,
      titleId: deleted[0].titleId,
      titleType: deleted[0].titleType,
      event: 'undo',
    });
  }
  if (removed && opts?.reverseFavorite) {
    await removeFavorite(
      userId,
      opts.reverseFavorite.titleId,
      opts.reverseFavorite.titleType,
    );
  }
  return removed;
}

// ---------------------------------------------------------------------------
// Read paths used by the swipe deck + cross-feature integrations (For You
// excludeSet, TasteProfile fold-in).
// ---------------------------------------------------------------------------

export interface SwipeKey {
  titleId: string;
  titleType: TitleType;
  action: SwipeAction;
}

/**
 * Returns `${titleType}:${titleId}` keys for the user, filtered to the
 * given actions (default: all four). The shape matches the key
 * convention already used by `getWatchedKeySet`, so callers can union
 * these into the same exclude set.
 */
export async function getSwipeKeySet(
  userId: string,
  actions?: SwipeAction[],
): Promise<Set<string>> {
  const rows = actions && actions.length > 0
    ? await db
        .select({
          titleId: titleSwipes.titleId,
          titleType: titleSwipes.titleType,
        })
        .from(titleSwipes)
        .where(
          and(
            eq(titleSwipes.userId, userId),
            inArray(titleSwipes.action, actions),
          ),
        )
    : await db
        .select({
          titleId: titleSwipes.titleId,
          titleType: titleSwipes.titleType,
        })
        .from(titleSwipes)
        .where(eq(titleSwipes.userId, userId));

  const set = new Set<string>();
  for (const r of rows) set.add(`${r.titleType}:${r.titleId}`);
  return set;
}

/**
 * Pulls grouped swipe lists keyed by action — used by the
 * recommendation pipeline to build "Because you liked X" reasons,
 * passed-genre penalties, etc. Lightweight: returns ids only, not
 * enriched TMDB data. Callers enrich on demand.
 */
export async function getSwipeSignals(
  userId: string,
): Promise<Record<SwipeAction, SwipeKey[]>> {
  const rows = await db
    .select({
      titleId: titleSwipes.titleId,
      titleType: titleSwipes.titleType,
      action: titleSwipes.action,
    })
    .from(titleSwipes)
    .where(eq(titleSwipes.userId, userId))
    // Newest first: callers slice "recent" passes and pick like-seeds
    // from the front of each list.
    .orderBy(desc(titleSwipes.updatedAt));

  const grouped: Record<SwipeAction, SwipeKey[]> = {
    liked: [],
    saved: [],
    passed: [],
    opened: [],
  };
  for (const r of rows) {
    const action = r.action as SwipeAction;
    const titleType = r.titleType as TitleType;
    if (!(action in grouped)) continue;
    grouped[action].push({ titleId: r.titleId, titleType, action });
  }
  return grouped;
}

// ---------------------------------------------------------------------------
// History (enriched, for the /swipe/history page)
// ---------------------------------------------------------------------------

export interface SwipeHistoryItem {
  /** title_swipes row id — used as a stable React key + undo/target handle. */
  swipeId: string;
  mediaType: TitleType;
  mediaId: string;
  title: string;
  year: number | null;
  posterPath: string | null;
  action: SwipeAction;
  /** ISO timestamp of when the swipe was (last) recorded. */
  swipedAt: string;
}

export interface GetSwipeHistoryOptions {
  limit?: number;
  /** Cursor: only rows created strictly before this instant (keyset paging). */
  before?: Date;
  /** Filter to a single action; omit for all actions. */
  action?: SwipeAction;
}

const SWIPE_HISTORY_DEFAULT_LIMIT = 24;
const SWIPE_HISTORY_MAX_LIMIT = 60;

/**
 * Returns the user's swipe history, newest first, enriched with the minimum
 * TMDB fields the history grid renders (title, year, poster). Enrichment
 * mirrors the deck's approach — a bounded, concurrency-capped fan-out of
 * cheap detail fetches (tmdbFetch is server-cached ~1h). A failed lookup
 * degrades to a poster-less row rather than dropping the swipe.
 */
export async function getSwipeHistory(
  userId: string,
  opts: GetSwipeHistoryOptions = {},
): Promise<SwipeHistoryItem[]> {
  const limit = Math.min(
    Math.max(opts.limit ?? SWIPE_HISTORY_DEFAULT_LIMIT, 1),
    SWIPE_HISTORY_MAX_LIMIT,
  );

  const conditions = [eq(titleSwipes.userId, userId)];
  if (opts.action) conditions.push(eq(titleSwipes.action, opts.action));
  // Ordered + paged by the LATEST decision (updatedAt), so a title whose
  // verdict changed (re-swiped, or changed from History) moves to the top
  // instead of keeping its first-swipe position.
  if (opts.before) conditions.push(lt(titleSwipes.updatedAt, opts.before));

  const rows = await db
    .select({
      id: titleSwipes.id,
      titleId: titleSwipes.titleId,
      titleType: titleSwipes.titleType,
      action: titleSwipes.action,
      updatedAt: titleSwipes.updatedAt,
    })
    .from(titleSwipes)
    .where(and(...conditions))
    .orderBy(desc(titleSwipes.updatedAt))
    .limit(limit);

  return mapWithConcurrency(rows, 6, async (r) => {
    const mediaType: TitleType = r.titleType === 'tv' ? 'tv' : 'movie';
    let title = '';
    let year: number | null = null;
    let posterPath: string | null = null;
    try {
      const raw = await tmdbFetch<{
        title?: string;
        name?: string;
        poster_path?: string | null;
        release_date?: string;
        first_air_date?: string;
      }>(`/${mediaType}/${r.titleId}`);
      title = (mediaType === 'movie' ? raw.title : raw.name) ?? '';
      posterPath = raw.poster_path ?? null;
      const date = mediaType === 'movie' ? raw.release_date : raw.first_air_date;
      year = date ? new Date(date).getFullYear() : null;
    } catch {
      // Degrade gracefully — keep the row so the user still sees the swipe.
    }
    return {
      swipeId: r.id,
      mediaType,
      mediaId: r.titleId,
      title,
      year,
      posterPath,
      action: r.action as SwipeAction,
      swipedAt: r.updatedAt.toISOString(),
    } satisfies SwipeHistoryItem;
  });
}

/** Wipes the user's entire swipe history. Does NOT touch Favorites. */
export async function resetSwipeHistory(userId: string): Promise<number> {
  const deleted = await db
    .delete(titleSwipes)
    .where(eq(titleSwipes.userId, userId))
    .returning({ id: titleSwipes.id });
  staleForYouPool(userId);
  return deleted.length;
}

// ---------------------------------------------------------------------------
// Event log (append-only)
// ---------------------------------------------------------------------------

/**
 * Appends one row to title_swipe_events. Best-effort: analytics must never
 * fail the user's swipe, so errors are logged and swallowed.
 */
async function logSwipeEvent(e: {
  userId: string;
  titleId: string;
  titleType: string;
  event: SwipeAction | 'undo';
  source?: SwipeSource;
  scoreSnapshot?: number;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await db.insert(titleSwipeEvents).values({
      userId: e.userId,
      titleId: e.titleId,
      titleType: e.titleType,
      event: e.event,
      source: e.source ?? 'swipe_discovery',
      scoreSnapshot: e.scoreSnapshot !== undefined ? String(e.scoreSnapshot) : null,
      metadata: e.metadata ?? null,
    });
  } catch (err) {
    logger.warn('Failed to log swipe event', { event: e.event, err });
  }
}
