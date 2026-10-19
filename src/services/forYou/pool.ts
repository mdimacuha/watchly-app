import 'server-only';

import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { watchlistItems, watchlists } from '@/db/schema';
import { trending } from '@/server/tmdb';
import { mapWithConcurrency } from '@/lib/concurrency';
import { getSelectedProviders } from '@/services/preferences/forYouPrefs';
import { forYouTag } from './cacheTag';
import {
  enrichCandidate,
  gatherCandidates,
  loadExcludeSet,
  loadPassedGenreSet,
  loadTrendingTodaySet,
  matchesProviderFilter,
  pickSeeds,
  scoreCandidate,
  unionSeedFeatures,
  type ForYouCandidate,
} from './index';

/**
 * ONE candidate pool per request for the For You page. Built once — seeds →
 * candidates → enrich → filter → score → dedupe — then every layout slices
 * it. Replaces the old per-row builders, which each fetched their own lists
 * (~150–240 TMDB calls) and never deduped against each other (the same
 * title in 3 rows, the hero repeated in a row).
 *
 * Wrapped in React `cache()` so all sections of one render share it, and in
 * `unstable_cache` so repeat visits within the TTL skip the build entirely.
 */

export interface PoolPick {
  key: string;
  ui: ForYouCandidate;
  /** Genre ids — lets layouts filter by mood without another fetch. */
  genreIds: number[];
  score: number;
  /** Human reasons, most important first ("Because you liked X", "On Netflix"). */
  reasons: string[];
  /** The seed title behind the pick, for grouping ("Because you liked X"). */
  seedTitle: string | null;
  /** The seed itself, so "Because you liked <X>" can open X's Quick View. */
  seed: { tmdbId: number; mediaType: 'movie' | 'tv'; title: string } | null;
}

export type ContinueStatus = 'watching' | 'waiting_for_episode' | 'waiting_for_season' | 'up_next';

export interface ContinueItem {
  key: string;
  ui: ForYouCandidate;
  status: ContinueStatus;
}

export interface ForYouPool {
  /** Ranked taste picks, unique, playable-looking (poster, no talk shows). */
  picks: PoolPick[];
  /** A few trending titles outside the user's usual taste, for discovery. */
  wildcards: PoolPick[];
  /** Shows/films the user is in the middle of or queued (watchlist status). */
  continueItems: ContinueItem[];
  /** False when the user has no favorites/watchlists/likes to seed from. */
  hasTaste: boolean;
}

const SCORING_POOL = 40;
const ENRICH_CONCURRENCY = 8;
const WILDCARD_LIMIT = 6;
const CONTINUE_LIMIT = 10;
const HIGH_RATING = 7.5;

// TMDB TV genres that aren't "something to watch tonight": talk shows,
// news, reality, soaps. They flooded the old Popular/Trending rows.
const EXCLUDED_GENRES = new Set([10763, 10764, 10766, 10767]);

const CONTINUE_ORDER: ContinueStatus[] = [
  'watching',
  'waiting_for_episode',
  'waiting_for_season',
  'up_next',
];

// Cross-request cache for the pool. A cold build is dozens of TMDB calls
// (recommendations per seed, enrich of up to 40 candidates + the continue
// list) plus several DB scans; the result is a small JSON object. Keyed by region because
// providers are regional. The tag is busted by every write to a pool input
// (see `invalidateForYouPool`), so the TTL is only a backstop for the
// trending/provider data that changes without a user action.
const POOL_REVALIDATE_SECONDS = 10 * 60;

export const getForYouPool = cache(async (userId: string, region: string): Promise<ForYouPool> => {
  const cached = unstable_cache(buildForYouPool, ['for-you-pool', userId, region], {
    revalidate: POOL_REVALIDATE_SECONDS,
    tags: [forYouTag(userId)],
  });
  return cached(userId, region);
});

async function buildForYouPool(userId: string, region: string): Promise<ForYouPool> {
  const [seeds, excludeSet, selectedProviders, passedGenres, trendingToday] = await Promise.all([
    pickSeeds(userId),
    loadExcludeSet(userId),
    getSelectedProviders(userId),
    loadPassedGenreSet(userId),
    loadTrendingTodaySet(),
  ]);
  const providerFilter = selectedProviders ? new Set<number>(selectedProviders) : null;

  // Continue list is the user's own intent — load it alongside candidates.
  const continuePromise = loadContinue(userId, region);

  const tally = seeds.length > 0 ? await gatherCandidates(seeds, excludeSet) : [];
  const scoring = tally.slice(0, SCORING_POOL);
  const enriched = await mapWithConcurrency(scoring, ENRICH_CONCURRENCY, (c) =>
    enrichCandidate(c, region),
  );

  const seedFeatures = unionSeedFeatures(seeds);
  const used = new Set<string>();
  const picks: PoolPick[] = [];
  enriched.forEach((ec, idx) => {
    if (!ec || !ec.ui.posterPath) return;
    if ([...ec.features.genreIds].some((g) => EXCLUDED_GENRES.has(g))) return;
    if (!matchesProviderFilter(ec.ui.providers, providerFilter)) return;
    const key = `${ec.ui.mediaType}:${ec.ui.tmdbId}`;
    if (used.has(key)) return;
    used.add(key);

    const seedTitle = scoring[idx].topSeed?.title ?? null;
    const topSeed = scoring[idx].topSeed;
    const seed = topSeed
      ? { tmdbId: topSeed.tmdbId, mediaType: topSeed.mediaType, title: topSeed.title }
      : null;
    const reasons = [
      seedTitle ? `Because you liked ${seedTitle}` : 'Matches your taste',
      ec.ui.providers[0] ? `On ${ec.ui.providers[0].providerName}` : null,
      ec.features.voteAverage >= HIGH_RATING ? `Rated ${ec.features.voteAverage.toFixed(1)}` : null,
      trendingToday.has(key) ? 'Trending today' : null,
    ].filter((r): r is string => r !== null);

    picks.push({
      key,
      ui: { ...ec.ui, reason: reasons[0] },
      genreIds: [...ec.features.genreIds],
      score: scoreCandidate(ec, seedFeatures, trendingToday, { tallyRank: idx, passedGenres }),
      reasons,
      seedTitle,
      seed,
    });
  });
  picks.sort((a, b) => b.score - a.score);

  const continueItems = await continuePromise;
  for (const c of continueItems) used.add(c.key);
  const wildcards = await loadWildcards(region, excludeSet, used);

  return { picks, wildcards, continueItems, hasTaste: seeds.length > 0 };
}

/** Watchlist items in progress / queued, most actionable status first. */
async function loadContinue(userId: string, region: string): Promise<ContinueItem[]> {
  const rows = await db
    .select({
      mediaId: watchlistItems.mediaId,
      mediaType: watchlistItems.mediaType,
      status: watchlistItems.status,
      updatedAt: watchlistItems.updatedAt,
    })
    .from(watchlistItems)
    .innerJoin(watchlists, eq(watchlists.id, watchlistItems.watchlistId))
    .where(and(eq(watchlists.userId, userId), inArray(watchlistItems.status, CONTINUE_ORDER)))
    .orderBy(desc(watchlistItems.updatedAt))
    .limit(CONTINUE_LIMIT * 2);

  const seen = new Set<string>();
  const unique = rows
    .filter((r) => {
      const key = `${r.mediaType}:${r.mediaId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort(
      (a, b) =>
        CONTINUE_ORDER.indexOf(a.status as ContinueStatus) -
        CONTINUE_ORDER.indexOf(b.status as ContinueStatus),
    )
    .slice(0, CONTINUE_LIMIT);

  const items = await mapWithConcurrency(unique, ENRICH_CONCURRENCY, async (r) => {
    const id = parseInt(r.mediaId, 10);
    if (!Number.isFinite(id)) return null;
    const ec = await enrichCandidate({ tmdbId: id, mediaType: r.mediaType, score: 1, topSeed: null }, region);
    if (!ec) return null;
    return { key: `${r.mediaType}:${id}`, ui: ec.ui, status: r.status as ContinueStatus };
  });
  return items.filter((i): i is ContinueItem => i !== null);
}

/**
 * Trending titles the user hasn't seen or been shown — cheap (one list call,
 * no per-title enrich), for a "wildcard" slot outside their usual taste.
 */
async function loadWildcards(
  region: string,
  excludeSet: Set<string>,
  used: Set<string>,
): Promise<PoolPick[]> {
  const raw = await trending.all('week', { region }).catch(() => ({ results: [] }));
  const out: PoolPick[] = [];
  for (const r of raw.results) {
    if (r.mediaType !== 'movie' && r.mediaType !== 'tv') continue;
    const key = `${r.mediaType}:${r.id}`;
    if (!r.posterPath || excludeSet.has(key) || used.has(key)) continue;
    if (r.genreIds?.some((g) => EXCLUDED_GENRES.has(g))) continue;
    used.add(key);
    const date = r.mediaType === 'movie' ? r.releaseDate : r.firstAirDate;
    out.push({
      key,
      ui: {
        tmdbId: r.id,
        mediaType: r.mediaType,
        title: r.mediaType === 'movie' ? r.title : r.name,
        posterPath: r.posterPath,
        backdropPath: r.backdropPath,
        year: date ? date.slice(0, 4) : null,
        voteAverage: r.voteAverage,
        overview: r.overview,
        runtimeMinutes: null,
        genres: [],
        reason: 'Trending this week',
        providers: [],
      },
      genreIds: r.genreIds ?? [],
      score: 0,
      reasons: ['Trending this week', 'Outside your usual picks'],
      seedTitle: null,
      seed: null,
    });
    if (out.length === WILDCARD_LIMIT) break;
  }
  return out;
}
