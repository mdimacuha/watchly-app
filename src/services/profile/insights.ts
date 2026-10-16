import 'server-only';

import { and, avg, count, desc, eq, inArray, or } from 'drizzle-orm';
import { db } from '@/db';
import { titleSwipes, userFavorites, userReviews, watchlistItems, watchlists } from '@/db/schema';
import { tmdbFetch } from '@/server/tmdb/client';

/**
 * Personality data for the profile redesign — the things that make a
 * profile "speak about" its owner. Everything is privacy-scoped: callers
 * pass what this viewer may see (hidden favorites / watched / private lists
 * never feed a visitor's numbers). Mostly SQL; TMDB only for the handful of
 * "now showing" posters (cached).
 */

export interface InsightTitle {
  mediaType: 'movie' | 'tv';
  tmdbId: number;
  title: string;
  year: string | null;
  posterPath: string | null;
  backdropPath: string | null;
}

export interface ProfileInsights {
  /** Films vs series across visible favorites + watched. */
  mix: { films: number; series: number };
  /** In-progress titles (status watching / rewatch) from visible lists. */
  nowShowing: InsightTitle[];
  /** First "up next" item — "Coming soon" on the marquee. */
  comingSoon: InsightTitle | null;
  /** Review voice: count, average stars, and their best-rated written review. */
  reviews: {
    count: number;
    average: number | null;
    top: { title: InsightTitle; rating: number; body: string } | null;
  };
  /** The owner's star rating per title ("movie:123" → 1–5) — ranks their top 4. */
  ratings: Record<string, number>;
  /** Watchly Swipe activity — owner only (swipes are never public). */
  swipes: { total: number; liked: number; passed: number; saved: number } | null;
}

export interface InsightScope {
  favorites: boolean;
  watched: boolean;
  /** Include items from private watchlists (owner only). */
  privateLists: boolean;
  /** Include Watchly Swipe stats (owner only). */
  swipes: boolean;
}

export async function getProfileInsights(
  ownerId: string,
  scope: InsightScope,
  watchedKeys: { mediaType: string; mediaId: string }[],
): Promise<ProfileInsights> {
  const [favRows, listItems, reviewAgg, topReviewRow, ratingRows, swipeRows] = await Promise.all([
    scope.favorites
      ? db
          .select({ type: userFavorites.favoriteType, id: userFavorites.favoriteId })
          .from(userFavorites)
          .where(
            and(
              eq(userFavorites.userId, ownerId),
              or(eq(userFavorites.favoriteType, 'movie'), eq(userFavorites.favoriteType, 'tv')),
            ),
          )
      : Promise.resolve([]),
    db
      .select({
        mediaType: watchlistItems.mediaType,
        mediaId: watchlistItems.mediaId,
        status: watchlistItems.status,
        updatedAt: watchlistItems.updatedAt,
        startedAt: watchlistItems.startedAt,
      })
      .from(watchlistItems)
      .innerJoin(watchlists, eq(watchlists.id, watchlistItems.watchlistId))
      .where(
        and(
          eq(watchlists.userId, ownerId),
          inArray(watchlistItems.status, ['watching', 'rewatch', 'up_next']),
          scope.privateLists ? undefined : eq(watchlists.isPublic, true),
        ),
      )
      .orderBy(desc(watchlistItems.updatedAt))
      // Generous: in-progress and up-next share this read, and the newest
      // edits may all be up-next items.
      .limit(40),
    db
      .select({ n: count(), avgRating: avg(userReviews.rating) })
      .from(userReviews)
      .where(eq(userReviews.userId, ownerId)),
    db
      .select({
        titleId: userReviews.titleId,
        titleType: userReviews.titleType,
        rating: userReviews.rating,
        body: userReviews.body,
      })
      .from(userReviews)
      .where(eq(userReviews.userId, ownerId))
      .orderBy(desc(userReviews.rating), desc(userReviews.createdAt))
      .limit(5),
    db
      .select({ titleId: userReviews.titleId, titleType: userReviews.titleType, rating: userReviews.rating })
      .from(userReviews)
      .where(eq(userReviews.userId, ownerId))
      .limit(500),
    scope.swipes
      ? db
          .select({ action: titleSwipes.action, n: count() })
          .from(titleSwipes)
          .where(eq(titleSwipes.userId, ownerId))
          .groupBy(titleSwipes.action)
      : Promise.resolve([]),
  ]);

  // Films vs series: unique titles across visible favorites + watched.
  const kinds = new Map<string, string>();
  for (const f of favRows) kinds.set(`${f.type}:${f.id}`, f.type);
  if (scope.watched) for (const w of watchedKeys) kinds.set(`${w.mediaType}:${w.mediaId}`, w.mediaType);
  let films = 0;
  let series = 0;
  for (const k of kinds.values()) {
    if (k === 'movie') films++;
    else if (k === 'tv') series++;
  }

  // "Now showing" = what they STARTED most recently. updatedAt alone was
  // misleading: editing notes or reordering a list touches it. Items
  // without a start date (legacy) fall back to updatedAt, after dated ones.
  const watching = listItems
    .filter((i) => i.status === 'watching' || i.status === 'rewatch')
    .sort(
      (a, b) =>
        (b.startedAt?.getTime() ?? 0) - (a.startedAt?.getTime() ?? 0) ||
        b.updatedAt.getTime() - a.updatedAt.getTime(),
    )
    .slice(0, 3);
  const upNext = listItems.find((i) => i.status === 'up_next');
  const topWritten = topReviewRow.find((r) => r.body && r.body.trim().length > 0);

  const [nowShowing, comingSoon, topTitle] = await Promise.all([
    Promise.all(watching.map((i) => loadTitle(i.mediaType, i.mediaId))),
    upNext ? loadTitle(upNext.mediaType, upNext.mediaId) : Promise.resolve(null),
    topWritten ? loadTitle(topWritten.titleType, topWritten.titleId) : Promise.resolve(null),
  ]);

  const agg = reviewAgg[0];
  return {
    swipes: scope.swipes ? summarizeSwipes(swipeRows) : null,
    ratings: Object.fromEntries(ratingRows.map((r) => [`${r.titleType}:${r.titleId}`, r.rating])),
    mix: { films, series },
    nowShowing: nowShowing.filter((t): t is InsightTitle => t !== null),
    comingSoon,
    reviews: {
      count: Number(agg?.n ?? 0),
      average: agg?.avgRating != null ? Math.round(Number(agg.avgRating) * 10) / 10 : null,
      top:
        topWritten && topTitle
          ? { title: topTitle, rating: topWritten.rating, body: topWritten.body!.trim() }
          : null,
    },
  };
}

export async function loadTitle(mediaType: string, mediaId: string): Promise<InsightTitle | null> {
  if (mediaType !== 'movie' && mediaType !== 'tv') return null;
  const id = parseInt(mediaId, 10);
  if (!Number.isFinite(id)) return null;
  try {
    const raw = await tmdbFetch<{
      title?: string;
      name?: string;
      release_date?: string;
      first_air_date?: string;
      poster_path?: string | null;
      backdrop_path?: string | null;
    }>(`/${mediaType}/${id}`);
    const date = mediaType === 'movie' ? raw.release_date : raw.first_air_date;
    return {
      mediaType,
      tmdbId: id,
      title: raw.title ?? raw.name ?? '',
      year: date ? date.slice(0, 4) : null,
      posterPath: raw.poster_path ?? null,
      backdropPath: raw.backdrop_path ?? null,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Taste match — visitor ↔ owner
// ---------------------------------------------------------------------------

export interface TasteMatch {
  /** 0–100. */
  percent: number;
  /** Titles both have favorited or watched. */
  shared: InsightTitle[];
  /** Genres both lean toward. */
  sharedGenres: string[];
  /** "Double feature": one of the owner's favorites the viewer hasn't got. */
  theirPick: InsightTitle | null;
}

/**
 * How alike two people's taste is, from what's visible: overlap of their
 * favorited/watched titles plus overlap of their top genres. Deliberately
 * simple and explainable ("you both love X, Y").
 */
export async function getTasteMatch(
  viewer: { keys: Set<string>; genres: string[] },
  owner: { keys: string[]; genres: string[] },
): Promise<TasteMatch> {
  const sharedKeys = owner.keys.filter((k) => viewer.keys.has(k));
  const genreSet = new Set(viewer.genres);
  const sharedGenres = owner.genres.filter((g) => genreSet.has(g));
  const genreUnion = new Set([...viewer.genres, ...owner.genres]).size || 1;

  const genreScore = sharedGenres.length / genreUnion; // 0–1
  const titleScore = Math.min(1, sharedKeys.length / 5); // 5 shared titles = full marks
  const percent = Math.round(100 * (0.6 * genreScore + 0.4 * titleScore));

  const pickKey = owner.keys.find((k) => !viewer.keys.has(k));
  const [shared, theirPick] = await Promise.all([
    Promise.all(sharedKeys.slice(0, 4).map((k) => loadTitle(...splitKey(k)))),
    pickKey ? loadTitle(...splitKey(pickKey)) : Promise.resolve(null),
  ]);

  return {
    percent,
    shared: shared.filter((t): t is InsightTitle => t !== null),
    sharedGenres,
    theirPick,
  };
}

function splitKey(key: string): [string, string] {
  const [type, id] = key.split(':');
  return [type, id];
}

/** Verdicts only ("opened" is a peek, not a swipe). */
function summarizeSwipes(rows: { action: string; n: number }[]) {
  const get = (a: string) => Number(rows.find((r) => r.action === a)?.n ?? 0);
  const liked = get('liked');
  const passed = get('passed');
  const saved = get('saved');
  return { total: liked + passed + saved, liked, passed, saved };
}
