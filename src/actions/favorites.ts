'use server';

import { getSession } from '@/server/auth/session';
import { addFavorite, getFavorites, isFavorite, removeFavorite, type FavoriteType } from '@/services/favorites';
import { getEnrichedFavorites } from '@/services/favorites/enrich';
import { revalidatePath } from 'next/cache';

export async function toggleFavoriteAction(
  id: string,
  type: FavoriteType,
  isFavorite: boolean,
  path?: string
) {
  const session = await getSession();
  if (!session) {
    throw new Error('Unauthorized');
  }

  try {
    if (isFavorite) {
      // If currently favorite, remove it
      await removeFavorite(session.userId, id, type);
    } else {
      // If not favorite, add it
      await addFavorite(session.userId, id, type);
    }

    if (path) {
      revalidatePath(path);
    }

    return { success: true };
  } catch (error) {
    console.error('Failed to toggle favorite:', error);
    throw new Error('Failed to update favorite');
  }
}

/**
 * Read whether the current user has favorited a given title. Used by
 * <FavoriteButton fetchInitial /> on ISR-cached public pages (title/artist/
 * collection), where the state can no longer be passed as a server prop.
 * Returns false for logged-out users (the button only renders when authed).
 */
export async function isFavoriteAction(
  id: string,
  type: FavoriteType,
): Promise<boolean> {
  const session = await getSession();
  if (!session) return false;
  return isFavorite(session.userId, id, type);
}

export async function getFavoritesAction() {
  const session = await getSession();
  if (!session) {
    throw new Error('Unauthorized');
  }
  const favorites = await getFavorites(session.userId);
  return favorites;
}

export async function getEnrichedFavoritesAction() {
  const session = await getSession();
  if (!session) {
    throw new Error('Unauthorized');
  }
  return getEnrichedFavorites(session.userId);
}