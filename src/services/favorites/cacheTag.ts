import 'server-only';

import { revalidateTag } from 'next/cache';

/**
 * Per-user tag on the cached enriched favorites list (see
 * `getEnrichedFavorites`). Same pattern as `services/forYou/cacheTag.ts`:
 * `revalidateTag` + `expire: 0` so it works from Route Handlers too and the
 * next read rebuilds instead of serving stale once.
 */
export const favoritesTag = (userId: string) => `favorites:${userId}`;

export function invalidateFavorites(userId: string): void {
  revalidateTag(favoritesTag(userId), { expire: 0 });
}
