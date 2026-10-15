import { db } from '@/db';
import { userFavorites } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { recordActivity } from '@/services/activity/record';
import { requireVerifiedOrInGrace } from '@/services/auth/verificationGate';

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