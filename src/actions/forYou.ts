'use server';

import { z } from 'zod';
import { cookies } from 'next/headers';
import { getSession } from '@/server/auth/session';
import { UnauthorizedAppError } from '@/utils/errors';
import { getUserRegion } from '@/services/preferences';
import {
  getForYouFeed,
  getForYouRow,
  type ForYouCandidate,
  type ForYouFeed,
  type ForYouRowId,
  type ForYouRowPage,
} from '@/services/forYou';
import { markAsWatched } from '@/services/watched';
import { revalidatePath } from 'next/cache';
import { getForYouPool, type ForYouPool } from '@/services/forYou/pool';

async function resolveRegion(userId: string): Promise<string> {
  // Same priority as the rest of the app: cookie → DB pref → 'US'.
  const cookieStore = await cookies();
  const cookieRegion = cookieStore.get('watchly_region')?.value;
  if (cookieRegion) return cookieRegion;
  try {
    const pref = await getUserRegion(userId);
    if (pref) return pref;
  } catch {
    // fall through
  }
  return 'US';
}

export async function getForYouFeedAction(): Promise<ForYouFeed> {
  const session = await getSession();
  if (!session) throw new UnauthorizedAppError();
  const region = await resolveRegion(session.userId);
  return getForYouFeed(session.userId, region);
}

// Kept in sync with the ForYouRowId union in @/services/forYou. `page` is
// clamped high enough to cover the deepest bounded pagination any row
// supports; out-of-range pages just resolve to an empty page server-side.
const rowPageInputSchema = z.object({
  rowId: z.enum([
    'from_favorites',
    'because_added',
    'up_next',
    'popular_right_now',
    'trending_this_week',
    'quick_picks',
  ]),
  page: z.number().int().min(1).max(50),
});

/**
 * Paginated fetch for a single For You row — powers the "View All" pages'
 * Load more / infinite scroll. Returns a window of items past the home
 * rail's cap plus a `hasMore` flag the client uses to gate further loads.
 */
export async function getForYouRowAction(input: {
  rowId: ForYouRowId;
  page: number;
}): Promise<ForYouRowPage> {
  const session = await getSession();
  if (!session) throw new UnauthorizedAppError();
  const { rowId, page } = rowPageInputSchema.parse(input);
  const region = await resolveRegion(session.userId);
  return getForYouRow(session.userId, region, rowId, { page });
}

/**
 * Returns a fresh hero candidate that isn't any of the ones the user has
 * already seen this session. `excludeKeys` is the cumulative list of
 * `"mediaType:tmdbId"` strings the client builds up across spins —
 * without this Spin Again ping-pongs between two titles when seeds are
 * sparse (only the immediately-previous hero gets excluded).
 */
export async function spinHeroAction(
  excludeKeys: string[],
): Promise<ForYouCandidate | null> {
  const session = await getSession();
  if (!session) throw new UnauthorizedAppError();
  const region = await resolveRegion(session.userId);
  const feed = await getForYouFeed(session.userId, region, {
    excludeKeys,
  });
  return feed.hero;
}

/**
 * Records a watch via the hybrid model and revalidates /for-you so the
 * just-watched title drops out of subsequent recommendations.
 */
export async function markAsWatchedAction(
  tmdbId: number,
  mediaType: 'movie' | 'tv',
): Promise<'watchlist_finished' | 'watched_table'> {
  const session = await getSession();
  if (!session) throw new UnauthorizedAppError();
  const where = await markAsWatched(
    session.userId,
    mediaType,
    String(tmdbId),
  );
  revalidatePath('/for-you');
  return where;
}

/**
 * The shared For You candidate pool (one build per request; layouts slice
 * it). See services/forYou/pool.ts.
 */
export async function getForYouPoolAction(): Promise<ForYouPool> {
  const session = await getSession();
  if (!session) throw new UnauthorizedAppError();
  const region = await resolveRegion(session.userId);
  return getForYouPool(session.userId, region);
}
