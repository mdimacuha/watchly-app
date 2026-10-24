import 'server-only';

import { revalidateTag } from 'next/cache';

/**
 * Per-member tag on the cached part of New & Coming Soon that's theirs
 * (watchlist films, followed shows). Kept dependency-free so the watchlist
 * and alert services can bust it without import cycles.
 */
export const newFeedTag = (userId: string) => `new:${userId}`;

/**
 * Expire the member's part at once: the next /new visit rebuilds it (~30
 * TMDB reads, mostly cache hits). `revalidateTag` + `expire: 0`, not
 * `updateTag`, because these writes also run from Route Handlers.
 */
export function invalidateNewFeed(userId: string): void {
  revalidateTag(newFeedTag(userId), { expire: 0 });
}
