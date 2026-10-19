import 'server-only';

import { revalidateTag } from 'next/cache';

/**
 * Per-user tag on the cached For You pool (see `getForYouPool`). Kept in its
 * own dependency-free module so the services that write the pool's inputs
 * (favorites, watchlists, watched, swipes, provider prefs) can bust it
 * without import cycles back into `forYou/`.
 */
export const forYouTag = (userId: string) => `for-you:${userId}`;

/**
 * Expire the user's cached pool immediately. Call after any write to a pool
 * input. `revalidateTag` (not `updateTag`) because these writes also run from
 * Route Handlers, where `updateTag` throws; `expire: 0` makes the next read
 * rebuild instead of serving the stale pool once.
 */
export function invalidateForYouPool(userId: string): void {
  revalidateTag(forYouTag(userId), { expire: 0 });
}
