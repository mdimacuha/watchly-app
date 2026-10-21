'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { getSession } from '@/server/auth/session';
import { UnauthorizedAppError, ValidationAppError } from '@/utils/errors';
import {
  recordSwipe,
  deleteSwipe,
  getSwipeDeck,
  getSwipeHistory,
  resetSwipeHistory,
  type SwipeDeckItem,
  type SwipeHistoryItem,
} from '@/services/swipe';
import {
  recordSwipeSchema,
  getSwipeDeckQuerySchema,
} from '@/services/swipe/validators';
import { SWIPE_ACTIONS, TITLE_TYPES } from '@/services/swipe/constants';

/**
 * Server actions are the in-app entry point — the /swipe page calls
 * these directly. The /api/v1/swipe REST routes exist for external
 * clients but the SwipeDeckClient skips that hop.
 */

async function requireUserId(): Promise<string> {
  const session = await getSession();
  if (!session) throw new UnauthorizedAppError();
  return session.userId;
}

export async function recordSwipeAction(
  input: unknown,
): Promise<{ favoriteAdded: boolean; swipeId: string }> {
  const userId = await requireUserId();
  const parsed = recordSwipeSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationAppError('Invalid swipe input', parsed.error.flatten());
  }

  const result = await recordSwipe({ userId, ...parsed.data });

  // Revalidate downstream surfaces:
  //   /for-you — the swiped title now lives in the excludeSet so the
  //              feed should drop it on next view.
  //   /me — favoritesCount/watchedCount may change when action=saved.
  revalidatePath('/programme');
  if (parsed.data.action === 'saved') {
    revalidatePath('/me');
    revalidatePath('/favorites');
  }

  // swipeId is the handle the deck keeps client-side so a single-step Undo
  // can delete exactly this row (not a re-swipe of the same title).
  return { favoriteAdded: result.favoriteAdded, swipeId: result.swipeId };
}

const undoSwipeSchema = z.object({
  swipeId: z.string().uuid(),
  tmdbId: z.number().int().positive(),
  mediaType: z.enum(TITLE_TYPES),
  // Set by the deck only when THIS swipe newly created a favorite (saved a
  // title that wasn't already favorited). Reversing it removes that favorite;
  // when false/omitted, a pre-existing favorite is left untouched.
  reverseFavorite: z.boolean().optional(),
});

export async function undoSwipeAction(
  input: unknown,
): Promise<{ undone: boolean }> {
  const userId = await requireUserId();
  const parsed = undoSwipeSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationAppError('Invalid undo input', parsed.error.flatten());
  }

  const { swipeId, tmdbId, mediaType, reverseFavorite } = parsed.data;
  const undone = await deleteSwipe(
    userId,
    swipeId,
    reverseFavorite
      ? { reverseFavorite: { titleId: String(tmdbId), titleType: mediaType } }
      : undefined,
  );

  revalidatePath('/programme');
  revalidatePath('/swipe');
  if (reverseFavorite) {
    revalidatePath('/me');
    revalidatePath('/favorites');
  }

  return { undone };
}

const getSwipeHistoryQuerySchema = z.object({
  limit: z.number().int().min(1).max(60).optional(),
  before: z.string().datetime().optional(),
  action: z.enum(SWIPE_ACTIONS).optional(),
});

export async function getSwipeHistoryAction(
  query: unknown = {},
): Promise<{ items: SwipeHistoryItem[] }> {
  const userId = await requireUserId();
  const parsed = getSwipeHistoryQuerySchema.safeParse(query);
  if (!parsed.success) {
    throw new ValidationAppError(
      'Invalid swipe history query',
      parsed.error.flatten(),
    );
  }

  const items = await getSwipeHistory(userId, {
    limit: parsed.data.limit,
    action: parsed.data.action,
    before: parsed.data.before ? new Date(parsed.data.before) : undefined,
  });
  return { items };
}

export async function getSwipeDeckAction(
  query: unknown = {},
): Promise<{ items: SwipeDeckItem[] }> {
  const userId = await requireUserId();
  const parsed = getSwipeDeckQuerySchema.safeParse(query);
  if (!parsed.success) {
    throw new ValidationAppError(
      'Invalid swipe deck query',
      parsed.error.flatten(),
    );
  }
  return getSwipeDeck(userId, parsed.data);
}

export async function resetSwipeHistoryAction(): Promise<{ deleted: number }> {
  const userId = await requireUserId();
  const deleted = await resetSwipeHistory(userId);
  revalidatePath('/swipe');
  revalidatePath('/programme');
  return { deleted };
}
