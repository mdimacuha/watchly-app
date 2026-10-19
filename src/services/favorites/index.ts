import { db } from '@/db';
import { userFavorites, watchlistItems } from '@/db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import { recordActivity } from '@/services/activity/record';
import { requireVerifiedOrInGrace } from '@/services/auth/verificationGate';
import { invalidateForYouPool } from '@/services/forYou/cacheTag';
import { invalidateFavorites } from './cacheTag';

export type FavoriteType = 'movie' | 'tv' | 'collection' | 'artist';

export async function addFavorite(
  userId: string,
  favoriteId: string,
  favoriteType: FavoriteType
) {
  await requireVerifiedOrInGrace(userId);
  const [favorite] = await db
    .insert(userFavorites)
    .values({
      userId,
      favoriteId,
      favoriteType,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoNothing({
      target: [userFavorites.userId, userFavorites.favoriteId, userFavorites.favoriteType],
    })
    .returning();

  // Only emit an event when this was a fresh insert (no row = already favorited).
  if (favorite) {
    invalidateForYouPool(userId);
    invalidateFavorites(userId);
    await recordActivity(userId, {
      type: 'favorite',
      payload: { mediaType: favoriteType, mediaId: favoriteId },
    });
  }
  return favorite;
}

export async function removeFavorite(
  userId: string,
  favoriteId: string,
  favoriteType: FavoriteType
) {
  await db
    .delete(userFavorites)
    .where(
      and(
        eq(userFavorites.userId, userId),
        eq(userFavorites.favoriteId, favoriteId),
        eq(userFavorites.favoriteType, favoriteType)
      )
    );
  invalidateForYouPool(userId);
  invalidateFavorites(userId);
}

/**
 * `"type:id"` keys of the user's favorites that appear in a watchlist, for
 * the detail page's heart state. Filters by subquery on the list's items, so
 * it can run in parallel with loading those items instead of after them.
 */
export async function getFavoriteKeysInWatchlist(
  userId: string,
  watchlistId: string,
): Promise<Set<string>> {
  const rows = await db
    .select({
      favoriteId: userFavorites.favoriteId,
      favoriteType: userFavorites.favoriteType,
    })
    .from(userFavorites)
    .where(
      and(
        eq(userFavorites.userId, userId),
        inArray(
          userFavorites.favoriteId,
          db
            .select({ mediaId: watchlistItems.mediaId })
            .from(watchlistItems)
            .where(eq(watchlistItems.watchlistId, watchlistId)),
        ),
      ),
    );
  return new Set(rows.map((r) => `${r.favoriteType}:${r.favoriteId}`));
}

export async function isFavorite(userId: string, favoriteId: string, favoriteType: FavoriteType) {
  const favorite = await db.query.userFavorites.findFirst({
    where: and(
      eq(userFavorites.userId, userId),
      eq(userFavorites.favoriteId, favoriteId),
      eq(userFavorites.favoriteType, favoriteType)
    ),
  });
  return !!favorite;
}

export async function getFavorites(
  userId: string,
  opts?: { limit?: number },
) {
  const favorites = await db.query.userFavorites.findMany({
    where: eq(userFavorites.userId, userId),
    orderBy: (f, { desc }) => [desc(f.createdAt)],
    limit: opts?.limit,
  });
  return favorites;
}