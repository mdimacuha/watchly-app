import { db } from '@/db';
import { watchlists, watchlistVotes } from '@/db/schema';
import { and, eq, sql } from 'drizzle-orm';
import { NotFoundAppError, ForbiddenAppError } from '@/utils/errors';

// ---------------------------------------------------------------------------
// Watchlist upvotes
//
// One vote per (watchlist, user) — the composite PK on `watchlist_votes`
// enforces that no user can double-vote. Upvoting inserts the row;
// un-upvoting deletes it. The public count is a COUNT(*) over watchlist_id.
//
// Owner behaviour: an owner IS allowed to upvote their own list. It's the
// simplest rule (no extra branch), matches how "likes" work on most social
// products, and can't be abused past +1 because of the composite PK.
// ---------------------------------------------------------------------------

export interface WatchlistVoteState {
  /** Total upvotes on the list (everyone). */
  count: number;
  /** Whether the given viewer has upvoted. Always false when viewer is null. */
  hasVoted: boolean;
}

export interface ToggleVoteResult {
  /** The viewer's NEW state after the toggle. */
  upvoted: boolean;
  /** Fresh total count after the toggle. */
  count: number;
}

/**
 * Resolve a watchlist and enforce read access. Mirrors the access rule in
 * `getWatchlist`: a list is visible to its owner OR when it's public. Votes
 * are only ever read/written against lists the viewer can actually see.
 */
async function requireAccessibleWatchlist(
  watchlistId: string,
  viewerId: string | null,
): Promise<{ ownerId: string; isPublic: boolean }> {
  const [row] = await db
    .select({ ownerId: watchlists.userId, isPublic: watchlists.isPublic })
    .from(watchlists)
    .where(eq(watchlists.id, watchlistId))
    .limit(1);

  if (!row) throw new NotFoundAppError('Watchlist not found');

  const isOwner = viewerId !== null && row.ownerId === viewerId;
  if (!isOwner && !row.isPublic) {
    throw new ForbiddenAppError('Watchlist is private');
  }

  return row;
}

async function countVotes(watchlistId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(watchlistVotes)
    .where(eq(watchlistVotes.watchlistId, watchlistId));
  return row?.count ?? 0;
}

async function hasVoted(
  watchlistId: string,
  userId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ userId: watchlistVotes.userId })
    .from(watchlistVotes)
    .where(
      and(
        eq(watchlistVotes.watchlistId, watchlistId),
        eq(watchlistVotes.userId, userId),
      ),
    )
    .limit(1);
  return row !== undefined;
}

/**
 * Toggle the viewer's upvote on a watchlist. If the row exists we delete it
 * (un-upvote), otherwise we insert it (upvote). `onConflictDoNothing` keeps the
 * insert idempotent under a race, and the composite PK guarantees the vote can
 * never count more than once. Returns the viewer's new state + fresh count.
 */
export async function toggleWatchlistUpvote(
  userId: string,
  watchlistId: string,
): Promise<ToggleVoteResult> {
  await requireAccessibleWatchlist(watchlistId, userId);

  const alreadyVoted = await hasVoted(watchlistId, userId);

  if (alreadyVoted) {
    await db
      .delete(watchlistVotes)
      .where(
        and(
          eq(watchlistVotes.watchlistId, watchlistId),
          eq(watchlistVotes.userId, userId),
        ),
      );
  } else {
    await db
      .insert(watchlistVotes)
      .values({ watchlistId, userId })
      .onConflictDoNothing();
  }

  const count = await countVotes(watchlistId);
  return { upvoted: !alreadyVoted, count };
}

/**
 * Read the vote state for a watchlist. `count` is returned for everyone;
 * `hasVoted` is only meaningful (and only queried) when a viewer is present.
 */
export async function getWatchlistVoteState(
  userId: string | null,
  watchlistId: string,
): Promise<WatchlistVoteState> {
  await requireAccessibleWatchlist(watchlistId, userId);

  const count = await countVotes(watchlistId);
  const voted = userId ? await hasVoted(watchlistId, userId) : false;

  return { count, hasVoted: voted };
}
