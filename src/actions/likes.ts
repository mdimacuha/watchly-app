'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { getSession } from '@/server/auth/session';
import { UnauthorizedAppError, ValidationAppError } from '@/utils/errors';
import { SWIPE_SOURCES, TITLE_TYPES } from '@/services/swipe/constants';
import type { ProfileLike, RemovedLike } from '@/services/swipe/likes';

// The profile's Likes tab. Reads follow the profile's visibility rules (owner
// always; visitors only when "Show my likes" is on); changes are owner-only.

const pageSchema = z.object({
  before: z.string().datetime().optional(),
  origin: z.enum(['swipe', 'reel']).optional(),
  asGuest: z.boolean().optional(),
});

/** A page of a profile's likes. Hidden from this viewer → an empty last page. */
export async function getProfileLikesPageAction(
  username: string,
  input: unknown = {},
): Promise<{ items: ProfileLike[]; hasMore: boolean }> {
  const parsed = pageSchema.safeParse(input);
  if (!parsed.success) throw new ValidationAppError('Invalid likes query', parsed.error.flatten());
  const session = await getSession();
  const viewerId = parsed.data.asGuest ? null : (session?.userId ?? null);
  const { getPublicProfileByUsername, visibilityPrefsOf } = await import('@/services/profile');
  const { resolveProfileVisibility } = await import('@/services/profile/visibility');
  const { getUserPreferencesRow } = await import('@/services/users/rows');
  const { getFollowState } = await import('@/services/social');
  const { getLikesPage } = await import('@/services/swipe/likes');

  const profile = await getPublicProfileByUsername(username, viewerId);
  const [prefsRow, follow] = await Promise.all([
    getUserPreferencesRow(profile.userId),
    getFollowState(viewerId, profile.userId),
  ]);
  const role =
    viewerId === profile.userId ? 'owner' : follow.status === 'accepted' ? 'follower' : 'stranger';
  if (!resolveProfileVisibility(visibilityPrefsOf(prefsRow), role).likes) return { items: [], hasMore: false };
  return getLikesPage(profile.userId, {
    before: parsed.data.before ? new Date(parsed.data.before) : undefined,
    origin: parsed.data.origin,
  });
}

async function requireUserId(): Promise<string> {
  const session = await getSession();
  if (!session) throw new UnauthorizedAppError();
  return session.userId;
}

/** Owner: remove one of their likes. Returns the Undo handle (null if already gone). */
export async function removeLikeAction(swipeId: unknown): Promise<RemovedLike | null> {
  const userId = await requireUserId();
  const id = z.string().uuid().safeParse(swipeId);
  if (!id.success) throw new ValidationAppError('Invalid like id');
  const { removeLike } = await import('@/services/swipe/likes');
  const removed = await removeLike(userId, id.data);
  revalidatePath('/swipe');
  return removed;
}

const restoreSchema = z.object({
  tmdbId: z.number().int().positive(),
  mediaType: z.enum(TITLE_TYPES),
  source: z.enum(SWIPE_SOURCES),
  action: z.enum(['liked', 'saved']),
  createdAt: z.string().datetime(),
  likedAt: z.string().datetime(),
});

/** Owner: Undo a removed like. */
export async function restoreLikeAction(input: unknown): Promise<{ restored: boolean }> {
  const userId = await requireUserId();
  const parsed = restoreSchema.safeParse(input);
  if (!parsed.success) throw new ValidationAppError('Invalid like', parsed.error.flatten());
  // Never let a restore claim a future timestamp and pin itself to the top.
  if (new Date(parsed.data.likedAt).getTime() > Date.now()) throw new ValidationAppError('Invalid like');
  const { restoreLike } = await import('@/services/swipe/likes');
  const restored = await restoreLike(userId, parsed.data);
  revalidatePath('/swipe');
  return { restored };
}
