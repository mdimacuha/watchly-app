import 'server-only';

import { db } from '@/db';
import { userFavorites } from '@/db/schema';
import { and, desc, eq, or } from 'drizzle-orm';
import { tmdbFetch } from '@/server/tmdb/client';

const BANNER_POSTER_COUNT = 5;
const POSTER_BASE = 'https://image.tmdb.org/t/p/w342';

/**
 * Returns up to 5 poster URLs from the user's most-recent movie/tv
 * favorites. Used by ProfileBanner to render a blurred poster collage.
 * Returns an empty array when the user has no qualifying favorites — the
 * banner component then renders nothing and the page falls back to the
 * plain accent strip.
 *
 * One TMDB detail fetch per favorite (1h-cached). Cheap on repeat.
 */
export async function getBannerPosters(userId: string): Promise<string[]> {
  const rows = await db
    .select({
      favoriteId: userFavorites.favoriteId,
      favoriteType: userFavorites.favoriteType,
    })
    .from(userFavorites)
    .where(
      and(
        eq(userFavorites.userId, userId),
        or(
          eq(userFavorites.favoriteType, 'movie'),
          eq(userFavorites.favoriteType, 'tv'),
        ),
      ),
    )
    .orderBy(desc(userFavorites.createdAt))
    .limit(BANNER_POSTER_COUNT * 2);

  // Resolve poster paths in parallel; drop missing posters from the
  // result so the component always gets fillable URLs.
  const resolved = await Promise.all(
    rows.map(async (r) => {
      try {
        const raw = await tmdbFetch<{ poster_path?: string | null }>(
          `/${r.favoriteType}/${r.favoriteId}`,
        );
        return raw.poster_path ? `${POSTER_BASE}${raw.poster_path}` : null;
      } catch {
        return null;
      }
    }),
  );

  return resolved
    .filter((u): u is string => Boolean(u))
    .slice(0, BANNER_POSTER_COUNT);
}
