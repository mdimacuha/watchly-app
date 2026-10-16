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
  type FollowStatus,
  type FollowState,
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
