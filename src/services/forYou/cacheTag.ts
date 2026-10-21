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
export function invalidateForYouPool(userId: string, opts: { library?: boolean } = {}): void {
  revalidateTag(forYouTag(userId), { expire: 0 });
  if (opts.library !== false) revalidateTag(libraryTag(userId), { expire: 0 });
}

/**
 * Swipes and likes: mark the pool stale instead of expiring it. The next
 * read serves the stale pool at once and rebuilds it in the background
 * (a cold build is seconds of TMDB/JustWatch calls, and swipes come in
 * bursts). `getForYouPool` drops freshly swiped titles from a stale pool
 * at read time, so a passed title still disappears straight away.
 */
export function staleForYouPool(userId: string): void {
  revalidateTag(forYouTag(userId), 'max');
}

/**
 * Per-user tag on the profile's heavier library caches — taste profile,
 * enriched watched list, watchlist runtimes. Busted with the pool by
 * favorites / watched / watchlist writes, but not by swipes or provider
 * prefs (`library: false`): those only steer For You, and rebuilding
 * these (a TMDB read per title) on every swipe made /me slow.
 */
export const libraryTag = (userId: string) => `library:${userId}`;
