'use server';

import { getSession } from '@/server/auth/session';
import { addFavorite, getFavorites, isFavorite, removeFavorite, type FavoriteType } from '@/services/favorites';
import { getEnrichedFavorites } from '@/services/favorites/enrich';
import { revalidatePath } from 'next/cache';
import {
  addToShelf,
  createShelf,
  deleteShelf,
  listShelves,
  removeFromShelf,
  setItemShelves,
  updateShelf,
} from '@/services/favorites/shelves';
import type { CreateShelfInput, UpdateShelfInput } from '@/services/favorites/validators';
import { AppError } from '@/utils/errors';

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
// ---------------------------------------------------------------------------
// Shelves (favorites page). Results instead of throws: Next hides thrown
// messages in production, and the UI needs e.g. "You already have a shelf
// called …" to show the user. Optimistic UI rolls back on { ok: false }.
// ---------------------------------------------------------------------------

export type ShelfActionResult = { ok: true } | { ok: false; error: string };

async function runShelf(fn: (userId: string) => Promise<unknown>): Promise<ShelfActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: 'Please sign in again.' };
  try {
    await fn(session.userId);
    return { ok: true };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: err.message };
    console.error('Shelf action failed:', err);
    return { ok: false, error: 'Something went wrong. Please try again.' };
  }
}

export async function listShelvesAction() {
  const session = await getSession();
  if (!session) throw new Error('Unauthorized');
  return listShelves(session.userId);
}

export async function createShelfAction(input: CreateShelfInput) {
  return runShelf((userId) => createShelf(userId, input));
}

export async function updateShelfAction(shelfId: string, input: UpdateShelfInput) {
  return runShelf((userId) => updateShelf(userId, shelfId, input));
}

export async function deleteShelfAction(shelfId: string) {
  return runShelf((userId) => deleteShelf(userId, shelfId));
}

export async function addToShelfAction(shelfId: string, favoriteKeys: string[]) {
  return runShelf((userId) => addToShelf(userId, { shelfId, favoriteKeys }));
}

export async function removeFromShelfAction(shelfId: string, favoriteKeys: string[]) {
  return runShelf((userId) => removeFromShelf(userId, { shelfId, favoriteKeys }));
}

export async function setItemShelvesAction(favoriteKey: string, shelfIds: string[]) {
  return runShelf((userId) => setItemShelves(userId, { favoriteKey, shelfIds }));
}
