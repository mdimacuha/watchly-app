import 'server-only';

import { and, desc, eq, inArray, lt } from 'drizzle-orm';
import { db } from '@/db';
import { titleSwipes } from '@/db/schema';
import { staleForYouPool } from '@/services/forYou/cacheTag';
import { tmdbFetch } from '@/server/tmdb/client';
import { mapWithConcurrency } from '@/lib/concurrency';
import { deleteSwipe } from './index';
import type { SwipeSource, TitleType } from './constants';

// The profile's Likes tab: titles liked in Watchly Swipe or the For You reel,
// newest first. A Favorite in Swipe ('saved') counts as a like too: it's the
// strongest yes the deck has. Who may read them is the caller's job (resolveProfileVisibility).

/** Where a like came from, as the profile shows it. */
export type LikeOrigin = 'swipe' | 'reel' | 'onboarding';

// Reel likes recorded before the 'reel' source existed say 'recommendation'.
/** Swipe verdicts the Likes tab shows. */
const LIKE_ACTIONS = ['liked', 'saved'] as const;

const ORIGIN_SOURCES: Record<LikeOrigin, SwipeSource[]> = {
  swipe: ['swipe_discovery', 'manual'],
  reel: ['reel', 'recommendation'],
  // Titles picked on signup's taste step.
  onboarding: ['onboarding'],
};

export const LIKES_PAGE_SIZE = 12;

export interface LikesPage {
  items: ProfileLike[];
  hasMore: boolean;
  /** Sources this profile has likes from; only on the first unfiltered page. */
  origins?: LikeOrigin[];
}

export interface ProfileLike {
  /** title_swipes id — the handle Unlike deletes. */
  id: string;
  mediaType: TitleType;
  tmdbId: string;
  origin: LikeOrigin;
  /** Favorited in Swipe (also on the user's Favorites), not just liked. */
  favorited: boolean;
  likedAt: string;
  title: string;
  year: number | null;
  runtime: number | null;
  genres: string[];
  overview: string;
  posterPath: string | null;
}

/** What Undo needs to put a removed like back exactly where it was. */
export interface RemovedLike {
  tmdbId: number;
  mediaType: TitleType;
  source: SwipeSource;
  action: (typeof LIKE_ACTIONS)[number];
  createdAt: string;
  likedAt: string;
}

export async function getLikesPage(
  userId: string,
  opts: { before?: Date; origin?: LikeOrigin } = {},
): Promise<LikesPage> {
  // The first unfiltered page also says which sources this profile has, so
  // the tab can hide filters that would only ever be empty.
  // Best-effort: on failure the tab just shows every filter.
  const origins = !opts.before && !opts.origin ? likeOrigins(userId).catch(() => undefined) : Promise.resolve(undefined);
  const where = [eq(titleSwipes.userId, userId), inArray(titleSwipes.action, [...LIKE_ACTIONS])];
  if (opts.before) where.push(lt(titleSwipes.updatedAt, opts.before));
  if (opts.origin) where.push(inArray(titleSwipes.source, ORIGIN_SOURCES[opts.origin]));

  const rows = await db
    .select({
      id: titleSwipes.id,
      titleId: titleSwipes.titleId,
      titleType: titleSwipes.titleType,
      source: titleSwipes.source,
      action: titleSwipes.action,
      updatedAt: titleSwipes.updatedAt,
    })
    .from(titleSwipes)
    .where(and(...where))
    .orderBy(desc(titleSwipes.updatedAt))
    .limit(LIKES_PAGE_SIZE + 1);

  // Same enrichment as Swipe History: capped fan-out of cached detail
  // fetches; a failed lookup keeps the like as a poster-less row.
  const items = await mapWithConcurrency(rows.slice(0, LIKES_PAGE_SIZE), 6, async (r): Promise<ProfileLike> => {
    const mediaType: TitleType = r.titleType === 'tv' ? 'tv' : 'movie';
    const like: ProfileLike = {
      id: r.id,
      mediaType,
      tmdbId: r.titleId,
      origin: originOf(r.source),
      favorited: r.action === 'saved',
      likedAt: r.updatedAt.toISOString(),
      title: '',
      year: null,
      runtime: null,
      genres: [],
      overview: '',
      posterPath: null,
    };
    try {
      const t = await tmdbFetch<{
        title?: string;
        name?: string;
        release_date?: string;
        first_air_date?: string;
        runtime?: number | null;
        episode_run_time?: number[];
        genres?: { name: string }[];
        overview?: string;
        poster_path?: string | null;
      }>(`/${mediaType}/${r.titleId}`);
      const date = mediaType === 'movie' ? t.release_date : t.first_air_date;
      return {
        ...like,
        title: (mediaType === 'movie' ? t.title : t.name) ?? '',
        year: date ? new Date(date).getFullYear() : null,
        runtime: t.runtime ?? t.episode_run_time?.[0] ?? null,
        genres: (t.genres ?? []).slice(0, 2).map((g) => g.name),
        overview: t.overview ?? '',
        posterPath: t.poster_path ?? null,
      };
    } catch {
      return like;
    }
  });

  return { items, hasMore: rows.length > LIKES_PAGE_SIZE, origins: await origins };
}

async function likeOrigins(userId: string): Promise<LikeOrigin[]> {
  const rows = await db
    .selectDistinct({ source: titleSwipes.source })
    .from(titleSwipes)
    .where(and(eq(titleSwipes.userId, userId), inArray(titleSwipes.action, [...LIKE_ACTIONS])));
  return [...new Set(rows.map((r) => originOf(r.source)))];
}

/**
 * Owner removes a like. Returns what Undo needs, or null if it was already
 * gone. Removing a Swipe favorite from Likes leaves the Favorites entry alone.
 */
export async function removeLike(userId: string, swipeId: string): Promise<RemovedLike | null> {
  const [row] = await db
    .select({
      titleId: titleSwipes.titleId,
      titleType: titleSwipes.titleType,
      source: titleSwipes.source,
      action: titleSwipes.action,
      createdAt: titleSwipes.createdAt,
      updatedAt: titleSwipes.updatedAt,
    })
    .from(titleSwipes)
    .where(and(eq(titleSwipes.id, swipeId), eq(titleSwipes.userId, userId), inArray(titleSwipes.action, [...LIKE_ACTIONS])))
    .limit(1);
  if (!row || !(await deleteSwipe(userId, swipeId))) return null;
  return {
    tmdbId: Number(row.titleId),
    mediaType: row.titleType === 'tv' ? 'tv' : 'movie',
    source: row.source as SwipeSource,
    action: row.action === 'saved' ? 'saved' : 'liked',
    createdAt: row.createdAt.toISOString(),
    likedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Undo for removeLike: puts the like back with its original timestamps so it
 * returns to the same spot. If the title was swiped again in the meantime,
 * that newer verdict wins and nothing is restored.
 */
export async function restoreLike(userId: string, like: RemovedLike): Promise<boolean> {
  const inserted = await db
    .insert(titleSwipes)
    .values({
      userId,
      titleId: String(like.tmdbId),
      titleType: like.mediaType,
      action: like.action,
      source: like.source,
      createdAt: new Date(like.createdAt),
      updatedAt: new Date(like.likedAt),
    })
    .onConflictDoNothing()
    .returning({ id: titleSwipes.id });
  if (inserted.length > 0) staleForYouPool(userId);
  return inserted.length > 0;
}

function originOf(source: string): LikeOrigin {
  if (ORIGIN_SOURCES.reel.includes(source as SwipeSource)) return 'reel';
  if (ORIGIN_SOURCES.onboarding.includes(source as SwipeSource)) return 'onboarding';
  return 'swipe';
}
