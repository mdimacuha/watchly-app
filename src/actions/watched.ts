'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '@/server/auth/session';
import { UnauthorizedAppError } from '@/utils/errors';
import { markAsWatched, unmarkWatched } from '@/services/watched';

/**
 * Server actions for the Watched surface on /me and the For You hero.
 * `markAsWatchedAction` lives here alongside `unmarkWatchedAction` so
 * components have a single import. The forYou.ts copy is kept (it
 * re-exports markAsWatched too) to avoid breaking the existing hero
 * call site — both paths land in the same service function.
 */

async function requireUserId(): Promise<string> {
  const session = await getSession();
  if (!session) throw new UnauthorizedAppError();
  return session.userId;
}

export async function markAsWatchedAction(
  mediaType: 'movie' | 'tv',
  mediaId: string,
): Promise<'watchlist_finished' | 'watched_table'> {
  const userId = await requireUserId();
  const where = await markAsWatched(userId, mediaType, mediaId);
  revalidatePath('/for-you');
  revalidatePath('/me');
  return where;
}

/**
 * Reverses Mark as Watched. Deletes the watched_titles row AND, if a
 * matching watchlist item exists with status='finished', flips it back
 * to 'watching' + clears finishedAt — so the title leaves the user's
 * watched set entirely.
 */
export async function unmarkWatchedAction(
  mediaType: 'movie' | 'tv',
  mediaId: string,
): Promise<void> {
  const userId = await requireUserId();
  await unmarkWatched(userId, mediaType, mediaId);
  revalidatePath('/me');
  revalidatePath('/for-you');
}
