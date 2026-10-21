import 'server-only';

import { db } from '@/db';
import {
  userFollows,
  userBlocks,
  userPreferences,
  users,
  userProfiles,
} from '@/db/schema';
import { and, eq, inArray, or, sql } from 'drizzle-orm';
import {
  NotFoundAppError,
  ForbiddenAppError,
  ValidationAppError,
} from '@/utils/errors';
import { createNotification } from '@/services/notifications';
import { requireVerifiedOrInGrace } from '@/services/auth/verificationGate';
import { logger } from '@/lib/log';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FollowStatus = 'accepted' | 'pending' | 'rejected' | 'cancelled';

export interface FollowState {
  /** Whether the viewer is currently following / requesting to follow. */
  status: FollowStatus | null;
  /** True when the target has blocked the viewer or vice versa. */
  blocked: boolean;
}

export interface FollowSummary {
  followersCount: number;
  followingCount: number;
}

export interface PublicUserCard {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  displayName: string;
  avatarUrl: string;
}

// ---------------------------------------------------------------------------
// Follow request / approval
// ---------------------------------------------------------------------------

/**
 * Initiate a follow. For public profiles auto-accepts; for followers-only
 * / private profiles inserts a pending row. Returns the resulting status
 * so callers can render the right button copy without re-querying.
 *
 * Side effects: emits a `follow_accepted` notification on auto-accept or a
 * `follow_request` notification on pending. Failures of the notification
 * write are swallowed so the follow operation succeeds atomically.
 */
export async function requestFollow(
  followerId: string,
  followingId: string,
): Promise<FollowStatus> {
  if (followerId === followingId) {
    throw new ValidationAppError('Cannot follow yourself');
  }
  await requireVerifiedOrInGrace(followerId);

  // Blocked check — blocker has hidden themselves from the blocked user
  // and vice versa. Either direction blocks a follow attempt.
  const blocked = await isEitherBlocked(followerId, followingId);
  if (blocked) throw new ForbiddenAppError('Follow not allowed');

  // Read target's visibility to decide auto-accept vs pending.
  const prefs = await db
    .select({ visibility: userPreferences.profileVisibility })
    .from(userPreferences)
    .where(eq(userPreferences.userId, followingId))
    .limit(1)
    .then((r) => r[0]);

  const visibility = prefs?.visibility ?? 'public';
  const status: FollowStatus = visibility === 'public' ? 'accepted' : 'pending';

  // Idempotent: ON CONFLICT (followerId, followingId) DO UPDATE keeps the
  // PK pair while letting the user re-request after a prior rejection /
  // cancellation. We re-write the status + createdAt so the timestamp
  // reflects the most recent attempt.
  await db
    .insert(userFollows)
    .values({ followerId, followingId, status })
    .onConflictDoUpdate({
      target: [userFollows.followerId, userFollows.followingId],
      set: { status, createdAt: new Date() },
    });

  // Fire-and-forget notification to the target. The type signals intent:
  //   pending  → 'follow_request' (target needs to approve)
  //   accepted → 'follow_back' (you have a new follower; want to follow
  //              back?). 'follow_accepted' is reserved for the inverse —
  //              telling the original requester their request was approved.
  try {
    await createNotification({
      userId: followingId,
      actorId: followerId,
      type: status === 'accepted' ? 'follow_back' : 'follow_request',
    });
  } catch (err) {
    logger.warn('[social] follow notification failed', err);
  }

  return status;
}

/**
 * Target accepts a pending follow request. Throws if no pending row exists.
 * Notifies the original follower that their request was accepted.
 */
export async function acceptFollow(
  /** The user who clicks "Accept" — owner of the request. */
  acceptingUserId: string,
  /** The user whose request is being accepted (the follower). */
  followerId: string,
): Promise<void> {
  const result = await db
    .update(userFollows)
    .set({ status: 'accepted' })
    .where(
      and(
        eq(userFollows.followerId, followerId),
        eq(userFollows.followingId, acceptingUserId),
        eq(userFollows.status, 'pending'),
      ),
    )
    .returning({ followerId: userFollows.followerId });

  if (result.length === 0) {
    throw new NotFoundAppError('No pending follow request');
  }

  try {
    await createNotification({
      userId: followerId,
      actorId: acceptingUserId,
      type: 'follow_accepted',
    });
  } catch (err) {
    logger.warn('[social] accept notification failed', err);
  }
}

/**
 * Reject a pending follow request. The row is updated rather than deleted
 * so re-requests don't immediately succeed in a race. A janitor job can
 * later purge old rejected rows.
 */
export async function rejectFollow(
  rejectingUserId: string,
  followerId: string,
): Promise<void> {
  await db
    .update(userFollows)
    .set({ status: 'rejected' })
    .where(
      and(
        eq(userFollows.followerId, followerId),
        eq(userFollows.followingId, rejectingUserId),
        eq(userFollows.status, 'pending'),
      ),
    );
}

/** Withdraw your own pending request. */
export async function cancelFollow(
  followerId: string,
  followingId: string,
): Promise<void> {
  await db
    .delete(userFollows)
    .where(
      and(
        eq(userFollows.followerId, followerId),
        eq(userFollows.followingId, followingId),
        eq(userFollows.status, 'pending'),
      ),
    );
}

/** Stop following someone you currently follow (accepted only). */
export async function unfollow(
  followerId: string,
  followingId: string,
): Promise<void> {
  await db
    .delete(userFollows)
    .where(
      and(
        eq(userFollows.followerId, followerId),
        eq(userFollows.followingId, followingId),
      ),
    );
}

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

/**
 * Batched variant of getFollowState for list pages. Returns a map keyed
 * by targetId. Missing IDs in the map mean { status: null, blocked: false }.
 * Saves N round-trips when rendering follower/following lists where every
 * row needs a Follow button.
 */
export async function getFollowStatesBulk(
  viewerId: string | null,
  targetIds: string[],
): Promise<Map<string, FollowState>> {
  const map = new Map<string, FollowState>();
  if (!viewerId || targetIds.length === 0) return map;

  const [followRows, blockRows] = await Promise.all([
    db
      .select({
        followingId: userFollows.followingId,
        status: userFollows.status,
      })
      .from(userFollows)
      .where(
        and(
          eq(userFollows.followerId, viewerId),
          inArray(userFollows.followingId, targetIds),
        ),
      ),
    db
      .select({
        blockerId: userBlocks.blockerId,
        blockedId: userBlocks.blockedId,
      })
      .from(userBlocks)
      .where(
        or(
          and(
            eq(userBlocks.blockerId, viewerId),
            inArray(userBlocks.blockedId, targetIds),
          ),
          and(
            inArray(userBlocks.blockerId, targetIds),
            eq(userBlocks.blockedId, viewerId),
          ),
        ),
      ),
  ]);

  const followLookup = new Map<string, FollowStatus>();
  for (const r of followRows) {
    followLookup.set(r.followingId, r.status as FollowStatus);
  }
  const blockedSet = new Set<string>();
  for (const r of blockRows) {
    blockedSet.add(r.blockerId === viewerId ? r.blockedId : r.blockerId);
  }

  for (const id of targetIds) {
    map.set(id, {
      status: followLookup.get(id) ?? null,
      blocked: blockedSet.has(id),
    });
  }
  return map;
}

export async function getFollowState(
  viewerId: string | null,
  targetId: string,
): Promise<FollowState> {
  if (!viewerId || viewerId === targetId) {
    return { status: null, blocked: false };
  }

  const [followRow, blocked] = await Promise.all([
    db
      .select({ status: userFollows.status })
      .from(userFollows)
      .where(
        and(
          eq(userFollows.followerId, viewerId),
          eq(userFollows.followingId, targetId),
        ),
      )
      .limit(1)
      .then((r) => r[0]),
    isEitherBlocked(viewerId, targetId),
  ]);

  return {
    status: (followRow?.status as FollowStatus | undefined) ?? null,
    blocked,
  };
}

/**
 * Followers + following counts (accepted only). Used in profile header.
 */
export async function getFollowSummary(
  userId: string,
): Promise<FollowSummary> {
  const [followers, following] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(userFollows)
      .where(
        and(
          eq(userFollows.followingId, userId),
          eq(userFollows.status, 'accepted'),
        ),
      )
      .then((r) => r[0]?.count ?? 0),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(userFollows)
      .where(
        and(
          eq(userFollows.followerId, userId),
          eq(userFollows.status, 'accepted'),
        ),
      )
      .then((r) => r[0]?.count ?? 0),
  ]);
  return { followersCount: followers, followingCount: following };
}

export async function listFollowers(
  userId: string,
  opts: { limit?: number } = {},
): Promise<PublicUserCard[]> {
  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      firstName: users.firstName,
      lastName: users.lastName,
      usersAvatarUrl: users.avatarUrl,
      profileAvatarUrl: userProfiles.avatarUrl,
      displayName: userProfiles.displayName,
    })
    .from(userFollows)
    .innerJoin(users, eq(users.id, userFollows.followerId))
    .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
    .where(
      and(
        eq(userFollows.followingId, userId),
        eq(userFollows.status, 'accepted'),
      ),
    )
    .orderBy(sql`${userFollows.createdAt} DESC`)
    .limit(opts.limit ?? 100);

  return rows.map(toPublicUserCard);
}

export async function listFollowing(
  userId: string,
  opts: { limit?: number } = {},
): Promise<PublicUserCard[]> {
  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      firstName: users.firstName,
      lastName: users.lastName,
      usersAvatarUrl: users.avatarUrl,
      profileAvatarUrl: userProfiles.avatarUrl,
      displayName: userProfiles.displayName,
    })
    .from(userFollows)
    .innerJoin(users, eq(users.id, userFollows.followingId))
    .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
    .where(
      and(
        eq(userFollows.followerId, userId),
        eq(userFollows.status, 'accepted'),
      ),
    )
    .orderBy(sql`${userFollows.createdAt} DESC`)
    .limit(opts.limit ?? 100);

  return rows.map(toPublicUserCard);
}

/**
 * Pending follow requests addressed TO `userId`. Used by the inbox UI
 * where users approve or reject incoming requests.
 */
export async function listPendingFollowRequests(
  userId: string,
): Promise<PublicUserCard[]> {
  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      firstName: users.firstName,
      lastName: users.lastName,
      usersAvatarUrl: users.avatarUrl,
      profileAvatarUrl: userProfiles.avatarUrl,
      displayName: userProfiles.displayName,
    })
    .from(userFollows)
    .innerJoin(users, eq(users.id, userFollows.followerId))
    .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
    .where(
      and(
        eq(userFollows.followingId, userId),
        eq(userFollows.status, 'pending'),
      ),
    )
    .orderBy(sql`${userFollows.createdAt} DESC`);

  return rows.map(toPublicUserCard);
}

/**
 * "Mutual followers" — accounts the viewer follows who also follow the
 * target. Returns the first N (for the "Followed by X, Y, and 3 others"
 * UX) plus the total count.
 */
export async function getMutualFollowers(
  viewerId: string,
  targetId: string,
  opts: { limit?: number } = {},
): Promise<{ users: PublicUserCard[]; totalCount: number }> {
  if (viewerId === targetId) return { users: [], totalCount: 0 };

  // Users the viewer follows AND who also follow the target. Two
  // self-joins on user_follows, gated by 'accepted' status on both.
  const followersOfTarget = db
    .select({ id: userFollows.followerId })
    .from(userFollows)
    .where(
      and(
        eq(userFollows.followingId, targetId),
        eq(userFollows.status, 'accepted'),
      ),
    );

  const mutualIdsRows = await db
    .select({ id: userFollows.followingId })
    .from(userFollows)
    .where(
      and(
        eq(userFollows.followerId, viewerId),
        eq(userFollows.status, 'accepted'),
        inArray(userFollows.followingId, followersOfTarget),
      ),
    );

  const ids = mutualIdsRows.map((r) => r.id);
  if (ids.length === 0) return { users: [], totalCount: 0 };

  const userRows = await db
    .select({
      id: users.id,
      username: users.username,
      firstName: users.firstName,
      lastName: users.lastName,
      usersAvatarUrl: users.avatarUrl,
      profileAvatarUrl: userProfiles.avatarUrl,
      displayName: userProfiles.displayName,
    })
    .from(users)
    .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
    .where(inArray(users.id, ids))
    .limit(opts.limit ?? 5);

  return {
    users: userRows.map(toPublicUserCard),
    totalCount: ids.length,
  };
}

// ---------------------------------------------------------------------------
// Follow suggestions — "people you may know", relevance-ranked on the follow
// graph rather than global popularity. Algorithm v2: second-degree
// connections (friends-of-friends). We take the accounts the viewer's
// followees follow, rank each candidate by how many of the viewer's followees
// reach it (mutual count) desc, and exclude self / blocked / already-followed
// (any status) / accounts that haven't verified their email. For viewers with a thin graph (brand-new users, users who
// follow nobody) we top up with a global popularity fallback (the old v1
// ordering) so the row is never empty.
// ---------------------------------------------------------------------------

export async function getFollowSuggestions(
  viewerId: string,
  opts: { limit?: number } = {},
): Promise<PublicUserCard[]> {
  const limit = opts.limit ?? 10;

  // Build the exclude set: self + every user the viewer has a follow
  // edge with (any status) + every blocked pair (either direction). The
  // exclude set is bounded by the viewer's social graph so this stays
  // cheap even for power users.
  const [existingEdges, blocks] = await Promise.all([
    db
      .select({ id: userFollows.followingId })
      .from(userFollows)
      .where(eq(userFollows.followerId, viewerId)),
    db
      .select({
        blockerId: userBlocks.blockerId,
        blockedId: userBlocks.blockedId,
      })
      .from(userBlocks)
      .where(
        or(
          eq(userBlocks.blockerId, viewerId),
          eq(userBlocks.blockedId, viewerId),
        ),
      ),
  ]);

  const excludeIds = new Set<string>([viewerId]);
  for (const r of existingEdges) excludeIds.add(r.id);
  for (const r of blocks) {
    excludeIds.add(r.blockerId === viewerId ? r.blockedId : r.blockerId);
  }

  // Second-degree ranking: the accounts followed by the accounts the viewer
  // follows, ordered by how many of the viewer's followees reach each
  // candidate. Same two-hop self-join shape as getMutualFollowers — a
  // subquery of the viewer's accepted followees (first hop) feeds an inArray
  // on the second hop. When the viewer follows nobody the subquery is empty
  // and this yields no rows, deferring entirely to the fallback below.
  // Over-fetch by the exclude-set size so the app-side anti-join still leaves
  // up to `limit` candidates.
  const viewerFollowees = db
    .select({ id: userFollows.followingId })
    .from(userFollows)
    .where(
      and(
        eq(userFollows.followerId, viewerId),
        eq(userFollows.status, 'accepted'),
      ),
    );

  const fofRows = await db
    .select({
      id: userFollows.followingId,
      mutuals: sql<number>`count(*)::int`,
    })
    .from(userFollows)
    // Only email-verified accounts are suggested (filtered in SQL so the
    // limit isn't spent on accounts that would be dropped).
    .innerJoin(users, eq(users.id, userFollows.followingId))
    .where(
      and(
        eq(userFollows.status, 'accepted'),
        inArray(userFollows.followerId, viewerFollowees),
        eq(users.isVerified, true),
      ),
    )
    .groupBy(userFollows.followingId)
    .orderBy(sql`count(*) DESC`)
    .limit(limit + excludeIds.size);

  // Apply the exclude set (anti-join in app code — the set is bounded) while
  // preserving the mutual-count ordering, then hydrate to cards. The
  // users.isDeleted=false filter is (re)applied during hydration.
  const fofCandidateIds = fofRows
    .map((r) => r.id)
    .filter((id) => !excludeIds.has(id));
  const fofCards = (await hydrateRankedUserCards(fofCandidateIds)).slice(
    0,
    limit,
  );

  if (fofCards.length >= limit) return fofCards;

  // Fallback: top up with globally-popular accounts (Algorithm v1 ordering)
  // so the row is never empty for viewers with a thin follow graph. Dedupe
  // against the exclude set plus anything the FoF pass already surfaced.
  const fallbackExclude = new Set<string>(excludeIds);
  for (const c of fofCards) fallbackExclude.add(c.id);
  const remaining = limit - fofCards.length;

  const fallbackRows = await db
    .select({
      id: users.id,
      username: users.username,
      firstName: users.firstName,
      lastName: users.lastName,
      usersAvatarUrl: users.avatarUrl,
      profileAvatarUrl: userProfiles.avatarUrl,
      displayName: userProfiles.displayName,
    })
    .from(users)
    .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
    .where(and(eq(users.isDeleted, false), eq(users.isVerified, true)))
    .orderBy(sql`(
      SELECT count(*)::int FROM ${userFollows}
      WHERE ${userFollows.followingId} = ${users.id}
        AND ${userFollows.status} = 'accepted'
    ) DESC`)
    .limit(remaining + fallbackExclude.size);

  const fallbackCards = fallbackRows
    .filter((r) => !fallbackExclude.has(r.id))
    .slice(0, remaining)
    .map(toPublicUserCard);

  return [...fofCards, ...fallbackCards];
}

// ---------------------------------------------------------------------------
// Blocking
// ---------------------------------------------------------------------------

export async function blockUser(
  blockerId: string,
  blockedId: string,
): Promise<void> {
  if (blockerId === blockedId) {
    throw new ValidationAppError('Cannot block yourself');
  }

  await db.transaction(async (tx) => {
    // Insert block (idempotent).
    await tx
      .insert(userBlocks)
      .values({ blockerId, blockedId })
      .onConflictDoNothing();

    // Severing existing follow edges keeps blocked-user UI consistent.
    await tx.delete(userFollows).where(
      or(
        and(
          eq(userFollows.followerId, blockerId),
          eq(userFollows.followingId, blockedId),
        ),
        and(
          eq(userFollows.followerId, blockedId),
          eq(userFollows.followingId, blockerId),
        ),
      ),
    );
  });
}

export async function unblockUser(
  blockerId: string,
  blockedId: string,
): Promise<void> {
  await db
    .delete(userBlocks)
    .where(
      and(
        eq(userBlocks.blockerId, blockerId),
        eq(userBlocks.blockedId, blockedId),
      ),
    );
}

export interface BlockedUser extends PublicUserCard {
  blockedAt: string;
}

/** People this user has blocked, most recent first (Settings → Privacy). */
export async function listBlockedUsers(blockerId: string): Promise<BlockedUser[]> {
  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      firstName: users.firstName,
      lastName: users.lastName,
      usersAvatar: users.avatarUrl,
      displayName: userProfiles.displayName,
      profileAvatar: userProfiles.avatarUrl,
      blockedAt: userBlocks.createdAt,
    })
    .from(userBlocks)
    .innerJoin(users, eq(users.id, userBlocks.blockedId))
    .leftJoin(userProfiles, eq(userProfiles.userId, userBlocks.blockedId))
    .where(eq(userBlocks.blockerId, blockerId))
    .orderBy(sql`${userBlocks.createdAt} desc`)
    .limit(500);
  return rows.map((r) => ({
    id: r.id,
    username: r.username,
    firstName: r.firstName,
    lastName: r.lastName,
    displayName: r.displayName || `${r.firstName} ${r.lastName}`.trim() || r.username,
    avatarUrl: r.profileAvatar || r.usersAvatar || '',
    blockedAt: r.blockedAt.toISOString(),
  }));
}

/**
 * True when either user has blocked the other. Used as a precondition
 * before any social interaction (follow, view, message-in-future, etc.).
 */
export async function isEitherBlocked(
  userAId: string,
  userBId: string,
): Promise<boolean> {
  const rows = await db
    .select({ blockerId: userBlocks.blockerId })
    .from(userBlocks)
    .where(
      or(
        and(
          eq(userBlocks.blockerId, userAId),
          eq(userBlocks.blockedId, userBId),
        ),
        and(
          eq(userBlocks.blockerId, userBId),
          eq(userBlocks.blockedId, userAId),
        ),
      ),
    )
    .limit(1);

  return rows.length > 0;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Hydrate an ordered list of ranked user ids into PublicUserCards. Drops
 * soft-deleted accounts (re-applying users.isDeleted=false) and preserves the
 * input ranking, so callers can feed pre-ranked id lists (e.g. friends-of-
 * friends ordered by mutual count) and get cards back in the same order.
 */
async function hydrateRankedUserCards(
  orderedIds: string[],
): Promise<PublicUserCard[]> {
  if (orderedIds.length === 0) return [];

  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      firstName: users.firstName,
      lastName: users.lastName,
      usersAvatarUrl: users.avatarUrl,
      profileAvatarUrl: userProfiles.avatarUrl,
      displayName: userProfiles.displayName,
    })
    .from(users)
    .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
    .where(and(inArray(users.id, orderedIds), eq(users.isDeleted, false)));

  const byId = new Map(rows.map((r) => [r.id, toPublicUserCard(r)]));
  return orderedIds
    .map((id) => byId.get(id))
    .filter((c): c is PublicUserCard => c !== undefined);
}

interface RawUserCardRow {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  usersAvatarUrl: string;
  profileAvatarUrl: string | null;
  displayName: string | null;
}

function toPublicUserCard(row: RawUserCardRow): PublicUserCard {
  return {
    id: row.id,
    username: row.username,
    firstName: row.firstName,
    lastName: row.lastName,
    displayName: row.displayName ?? '',
    avatarUrl: row.profileAvatarUrl || row.usersAvatarUrl || '',
  };
}

export interface FollowListExtras {
  accentColor: string | null;
  bio: string;
  /** True when this person follows the viewer (accepted). */
  followsViewer: boolean;
}

/**
 * Extra per-person details for the followers / following pages: their
 * accent (cards wear it), bio, and whether they follow the viewer — two
 * batched queries regardless of list length.
 */
export async function getFollowListExtras(
  viewerId: string | null,
  ids: string[],
): Promise<Map<string, FollowListExtras>> {
  const map = new Map<string, FollowListExtras>();
  if (ids.length === 0) return map;

  const [profiles, followsViewer] = await Promise.all([
    db
      .select({ userId: userProfiles.userId, accentColor: userProfiles.accentColor, bio: userProfiles.bio })
      .from(userProfiles)
      .where(inArray(userProfiles.userId, ids)),
    viewerId
      ? db
          .select({ followerId: userFollows.followerId })
          .from(userFollows)
          .where(
            and(
              eq(userFollows.followingId, viewerId),
              eq(userFollows.status, 'accepted'),
              inArray(userFollows.followerId, ids),
            ),
          )
      : Promise.resolve([] as { followerId: string }[]),
  ]);

  const followers = new Set(followsViewer.map((r) => r.followerId));
  const byId = new Map(profiles.map((p) => [p.userId, p]));
  for (const id of ids) {
    const p = byId.get(id);
    map.set(id, {
      accentColor: p?.accentColor ?? null,
      bio: p?.bio ?? '',
      followsViewer: followers.has(id),
    });
  }
  return map;
}
