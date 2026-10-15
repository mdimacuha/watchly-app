'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '@/server/auth/session';
import { UnauthorizedAppError } from '@/utils/errors';
import {
  updateProfile,
  getProfileWithStats,
  getMyProfileOverview,
  getPublicProfileOverview,
} from '@/services/profile';
import { invalidateAccentColorFor } from '@/services/profile/accentCache';
import type { UpdateProfileInput } from '@/services/profile/validators';

export async function updateProfileAction(input: UpdateProfileInput) {
  const session = await getSession();
  if (!session) throw new UnauthorizedAppError();
  const updated = await updateProfile(session.userId, input);
  // accent_color sits behind a per-user unstable_cache tag so the layout
  // doesn't refetch it on every nav. Bust the tag when the user edits.
  invalidateAccentColorFor(session.userId);
  revalidatePath('/me');
  return updated;
}

export async function getMyProfileAction() {
  const session = await getSession();
  if (!session) throw new UnauthorizedAppError();
  return getProfileWithStats(session.userId);
}

export async function getMyProfileOverviewAction() {
  const session = await getSession();
  if (!session) throw new UnauthorizedAppError();
  return getMyProfileOverview(session.userId);
}

export async function getPublicProfileAction(username: string) {
  const session = await getSession();
  const viewerId = session?.userId ?? null;
  return getPublicProfileOverview(username, viewerId);
}
