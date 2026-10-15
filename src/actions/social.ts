'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '@/server/auth/session';
import { UnauthorizedAppError } from '@/utils/errors';
import {
  requestFollow,
  acceptFollow,
  rejectFollow,
  cancelFollow,
  unfollow,
  blockUser,
  unblockUser,
  getFollowState,
  getFollowStatesBulk,
  listFollowers,
  listFollowing,
  type FollowStatus,
  type FollowState,
  type PublicUserCard,
} from '@/services/social';

async function requireUserId(): Promise<string> {
  const session = await getSession();
  if (!session) throw new UnauthorizedAppError();
  return session.userId;
}

export async function followAction(
  followingId: string,
): Promise<FollowStatus> {
  const followerId = await requireUserId();
  const status = await requestFollow(followerId, followingId);
  // Revalidate the target's public profile so the follower count + button
  // state catch up on next visit even without optimistic update.
  revalidatePath(`/user`, 'layout');
  return status;
}

export async function unfollowAction(followingId: string): Promise<void> {
  const followerId = await requireUserId();
  await unfollow(followerId, followingId);
  revalidatePath(`/user`, 'layout');
}

export async function cancelFollowRequestAction(
  followingId: string,
): Promise<void> {
  const followerId = await requireUserId();
  await cancelFollow(followerId, followingId);
  revalidatePath(`/user`, 'layout');
}

/**
 * Target accepts a follow request from `followerId`. Different from
 * unfollow: this is the inverse operation — the *acceptor* is the target.
 */
export async function acceptFollowRequestAction(
  followerId: string,
): Promise<void> {
  const acceptingUserId = await requireUserId();
  await acceptFollow(acceptingUserId, followerId);
  revalidatePath('/notifications');
  revalidatePath('/me/follow-requests');
}

export async function rejectFollowRequestAction(
  followerId: string,
): Promise<void> {
  const rejectingUserId = await requireUserId();
  await rejectFollow(rejectingUserId, followerId);
  revalidatePath('/notifications');
  revalidatePath('/me/follow-requests');
}

export async function blockAction(blockedId: string): Promise<void> {
  const blockerId = await requireUserId();
  await blockUser(blockerId, blockedId);
  revalidatePath(`/user`, 'layout');
}

export async function unblockAction(blockedId: string): Promise<void> {
  const blockerId = await requireUserId();
  await unblockUser(blockerId, blockedId);
  revalidatePath(`/user`, 'layout');
}

export async function getFollowStateAction(
  targetId: string,
): Promise<FollowState> {
  const session = await getSession();
  return getFollowState(session?.userId ?? null, targetId);
}

export interface FollowListEntry {
  user: PublicUserCard;
  status: FollowStatus | null;
  blocked: boolean;
  isSelf: boolean;
}

/**
 * Lists followers/following for a given user, joined with the viewer's
 * follow state per row so each card can render a correct Follow button
 * without an extra round-trip per item. `targetUserId` defaults to the
 * caller — passing null/undefined means "my list".
 */
async function loadFollowList(
  source: 'followers' | 'following',
  targetUserId: string | null,
): Promise<FollowListEntry[]> {
  const viewerId = await requireUserId();
  const ownerId = targetUserId ?? viewerId;

  const rows =
    source === 'followers'
      ? await listFollowers(ownerId)
      : await listFollowing(ownerId);

  const states = await getFollowStatesBulk(
    viewerId,
    rows.map((u) => u.id),
  );

  return rows.map((u) => {
    const s = states.get(u.id);
    return {
      user: u,
      status: s?.status ?? null,
      blocked: s?.blocked ?? false,
      isSelf: viewerId === u.id,
    };
  });
}

export async function listMyFollowersAction(): Promise<FollowListEntry[]> {
  return loadFollowList('followers', null);
}

export async function listMyFollowingAction(): Promise<FollowListEntry[]> {
  return loadFollowList('following', null);
}

export async function listUserFollowersAction(
  userId: string,
): Promise<FollowListEntry[]> {
  return loadFollowList('followers', userId);
}

export async function listUserFollowingAction(
  userId: string,
): Promise<FollowListEntry[]> {
  return loadFollowList('following', userId);
}
