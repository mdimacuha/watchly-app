import 'server-only';

import {
  pickSeeds,
  gatherCandidates,
  enrichCandidate,
  loadExcludeSet,
  type RankedCandidate,
} from '@/services/forYou';
import { getUserRegion } from '@/services/preferences';
import { getSelectedProviders } from '@/services/preferences/forYouPrefs';
import { tmdbFetch } from '@/server/tmdb/client';
import { mapMovie, mapTv } from '@/server/tmdb/mappers';
import { getSwipeKeySet, getSwipeSignals } from './index';
import {
  DECIDED_SWIPE_ACTIONS,
  SWIPE_DECK_DEFAULT_LIMIT,
  SWIPE_WILDCARD_EVERY,
} from './constants';

// ---------------------------------------------------------------------------
// Output shape
// ---------------------------------------------------------------------------

export interface SwipeDeckItem {
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  title: string;
  overview: string | null;
  posterPath: string | null;
  backdropPath: string | null;
  releaseDate: string | null;
  year: number | null;
  voteAverage: number | null;
  popularity: number | null;
  genres: { id: number; name: string }[];
  providers: {
    providerId: number;
    providerName: string;
    logoPath: string | null;
  }[];
  recommendationScore: number;
  reason: string;
  /**
   * True when this card was injected from the wildcard pool (every
   * Nth slot, sourced from /trending). The UI renders a distinct
   * chip so the user knows it's an exploration pick — keeps off-taste
   * passes from being treated as failed recommendations.
   */
  isWildcard?: boolean;
}

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

// Cap how many candidates we score+enrich per deck request. Each enrich
// is a TMDB detail fetch with append_to_response — bounded fan-out is
// what keeps this responsive on free TMDB tier.
const SWIPE_SCORING_POOL = 30;
// Deepest TMDB /popular page the top-up will read (20 movies + 20 shows
// per page), bounding TMDB calls per deck request.
const POPULAR_MAX_PAGES = 5;

// Multipliers for the swipe score on top of the For You gatherCandidates
// tally. Tuned so personalization (seed overlap) outranks raw popularity
// but is dampened by the passed-genre penalty.
const SEED_OVERLAP_WEIGHT = 4;
const PROVIDER_AVAILABILITY_BONUS = 5;
const VOTE_AVERAGE_WEIGHT = 1.5;
const PASSED_GENRE_PENALTY_WEIGHT = 4;
const PASSED_GENRE_PENALTY_CAP = 3;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

interface SwipeDeckOptions {
  mediaType?: 'movie' | 'tv' | 'all';
  region?: string;
  limit?: number;
  availableOnly?: boolean;
}

interface SwipeDeckResult {
  items: SwipeDeckItem[];
}

/**
 * Builds the swipe deck. Composes the existing For You pipeline:
 *   pickSeeds → gatherCandidates → enrichCandidate
 * and layers swipe-specific signals on top:
 *   - exclude every already-swiped title
 *   - subtract a penalty for genres matching recently passed titles
 *   - prefer titles available on the user's selected providers
 *
 * Falls back to /movie/popular + /tv/popular when the user has no seeds
 * (fresh signup, never favorited or swiped anything) so the deck never
 * comes back empty.
 */
export async function getSwipeDeck(
  userId: string,
  opts: SwipeDeckOptions = {},
): Promise<SwipeDeckResult> {
  const region = opts.region ?? (await getUserRegion(userId)) ?? 'PH';
  const limit = opts.limit ?? SWIPE_DECK_DEFAULT_LIMIT;
  const mediaTypeFilter = opts.mediaType ?? 'all';
  const availableOnly = opts.availableOnly ?? false;

  // Gather all the signals we need in parallel.
  const [seeds, baseExcludeSet, swipeKeys, swipeSignals, selectedProviders] =
    await Promise.all([
      pickSeeds(userId),
      loadExcludeSet(userId),
      // Decided titles (liked / saved / passed) are excluded so the user
      // doesn't see them twice. "opened" is NOT a decision — it's a Quick
      // View peek — so a peeked title can still come back around.
      getSwipeKeySet(userId, DECIDED_SWIPE_ACTIONS),
      getSwipeSignals(userId),
      getSelectedProviders(userId),
    ]);

  const excludeSet = new Set<string>([...baseExcludeSet, ...swipeKeys]);

  // Build a passed-genre tally to feed the scoring penalty. We can't
  // know the genres of the passed titles without enriching them, but
  // the For You enricher is cached per-id so this hits the same TMDB
  // call shared with the rest of the pipeline. It only depends on the
  // already-resolved swipe signals, so run it concurrently with the
  // candidate gather/enrich instead of blocking on it here.
  const passedGenresPromise = tallyPassedGenres(swipeSignals.passed);

  // Candidate sources:
  //   1. Seed-based (recommendations + similar) when the user has any
  //      meaningful taste data (favorites / watchlist / liked swipes).
  //   2. Popular fallback when they don't — keeps the deck warm for
  //      brand-new users so they can start swiping immediately.
  //   3. Top-up: when seeds yield fewer than a scoring pool's worth (heavy
  //      swipers burn through their seed pool), fill the rest from popular
  //      titles, paging deeper as earlier pages get decided — so the deck
  //      doesn't dead-end at "all caught up".
  let ranked: RankedCandidate[] =
    seeds.length > 0 ? await gatherCandidates(seeds, excludeSet) : [];
  if (ranked.length < SWIPE_SCORING_POOL) {
    const taken = new Set([
      ...excludeSet,
      ...ranked.map((c) => `${c.mediaType}:${c.tmdbId}`),
    ]);
    const filler = await popularFallback(
      region,
      taken,
      SWIPE_SCORING_POOL - ranked.length,
    );
    ranked = [...ranked, ...filler];
  }

  // Filter by media-type intent BEFORE enrichment so we don't burn
  // TMDB fetches on rows that can't appear in the deck anyway.
  const typeFiltered = ranked.filter((c) =>
    mediaTypeFilter === 'all' ? true : c.mediaType === mediaTypeFilter,
  );

  const pool = typeFiltered.slice(0, SWIPE_SCORING_POOL);
  const [enriched, passedGenres] = await Promise.all([
    Promise.all(pool.map((c) => enrichCandidate(c, region))),
    passedGenresPromise,
  ]);

  const items: SwipeDeckItem[] = [];
  for (let i = 0; i < enriched.length; i++) {
    const e = enriched[i];
    const c = pool[i];
    if (!e) continue;
    if (!e.ui.posterPath) continue;

    // Optional hard filter on user-selected providers; off by default
    // because the deck reads as broken when the user hasn't built a
    // taste profile yet.
    const providerMatch =
      selectedProviders === null || selectedProviders.length === 0
        ? true
        : e.features.hasRegionFlatrate &&
          e.ui.providers.some((p) => selectedProviders.includes(p.providerId));
    if (availableOnly && !providerMatch) continue;

    // Score the candidate. Reuses the gatherCandidates seed-overlap
    // tally (c.score) as the personalization signal, then layers
    // availability, quality, and the passed-genre penalty on top.
    const passedPenalty = Math.min(
      countGenreOverlap(e.features.genreIds, passedGenres),
      PASSED_GENRE_PENALTY_CAP,
    );

    const score =
      c.score * SEED_OVERLAP_WEIGHT +
      (e.features.hasRegionFlatrate ? PROVIDER_AVAILABILITY_BONUS : 0) +
      (e.features.voteAverage / 2) * VOTE_AVERAGE_WEIGHT -
      passedPenalty * PASSED_GENRE_PENALTY_WEIGHT;

    items.push({
      tmdbId: e.ui.tmdbId,
      mediaType: e.ui.mediaType,
      title: e.ui.title,
      overview: e.ui.overview || null,
      posterPath: e.ui.posterPath,
      backdropPath: e.ui.backdropPath,
      releaseDate: e.ui.year ? `${e.ui.year}-01-01` : null,
      year: e.ui.year ? Number(e.ui.year) : null,
      voteAverage: e.features.voteAverage || null,
      popularity: null, // Not surfaced by enrichCandidate today; punt.
      genres: e.ui.genres.map((name) => ({ id: 0, name })),
      providers: e.ui.providers,
      recommendationScore: score,
      reason: e.ui.reason ?? 'Recommended for you',
    });
  }

  items.sort((a, b) => b.recommendationScore - a.recommendationScore);

  // Wildcard injection. After scoring + sorting, fetch a small pool of
  // trending titles and splice one in at every Nth position. The
  // wildcards don't compete with scored candidates for slots — they're
  // ADDED at index 9, 19, 29, … so the user sees one roughly every 10
  // cards regardless of how the personalised list ranked.
  //
  // Done last so:
  //   1. The wildcard pool can deduplicate against the scored list.
  //   2. The exclude set already accounts for everything the user
  //      has interacted with.
  //   3. The splice positions are stable (insertion never shifts a
  //      scored card past another wildcard slot).
  const scoredKeys = new Set(
    items.map((i) => `${i.mediaType}:${i.tmdbId}`),
  );
  const wildcards = await getWildcardPool(region, excludeSet, scoredKeys);

  const out: SwipeDeckItem[] = [];
  let wildcardIdx = 0;
  for (let i = 0; i < items.length; i++) {
    out.push(items[i]);
    // Splice AFTER every Nth scored item — so positions 10, 20, 30 in
    // the final list (0-indexed: 9, 19, 29 since we push item first).
    if (
      (out.length) % SWIPE_WILDCARD_EVERY === 0 &&
      wildcardIdx < wildcards.length &&
      out.length < limit
    ) {
      out.push(wildcards[wildcardIdx++]);
    }
    if (out.length >= limit) break;
  }
  return { items: out.slice(0, limit) };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function countGenreOverlap(a: Set<number>, b: Set<number>): number {
  let n = 0;
  for (const id of a) if (b.has(id)) n++;
  return n;
}

/**
 * Wildcard pool — culturally-buzzy titles from TMDB /trending. Soft
 * exploration (no taste link). Used to splice an off-profile pick into
 * the deck every Nth slot.
 *
 * Cheap: one /trending fetch per deck request, results are 1h-cached
 * server-side by tmdbFetch. We deliberately don't run these through
 * the full enrichCandidate fan-out (credits/keywords/watch-providers
 * per candidate) — wildcards don't need cast/crew scoring, just a
 * poster, title, and reason chip.
 */
async function getWildcardPool(
  region: string,
  excludeSet: Set<string>,
  scoredKeys: Set<string>,
): Promise<SwipeDeckItem[]> {
  let trending: Array<{
    id: number;
    media_type?: string;
    title?: string;
    name?: string;
    overview?: string;
    poster_path?: string | null;
    backdrop_path?: string | null;
    vote_average?: number;
    release_date?: string;
    first_air_date?: string;
    genre_ids?: number[];
  }> = [];
  try {
    const raw = await tmdbFetch<{ results: typeof trending }>(
      '/trending/all/week',
      { region },
    );
    trending = raw.results;
  } catch {
    return [];
  }

  const out: SwipeDeckItem[] = [];
  for (const r of trending) {
    const mediaType =
      r.media_type === 'movie' || r.media_type === 'tv' ? r.media_type : null;
    if (!mediaType) continue; // skip /trending people
    if (!r.poster_path) continue;

    const key = `${mediaType}:${r.id}`;
    if (excludeSet.has(key)) continue;
    if (scoredKeys.has(key)) continue;

    const date = mediaType === 'movie' ? r.release_date : r.first_air_date;
    const year = date ? new Date(date).getFullYear() : null;

    out.push({
      tmdbId: r.id,
      mediaType,
      title: (mediaType === 'movie' ? r.title : r.name) ?? '',
      overview: r.overview || null,
      posterPath: r.poster_path ?? null,
      backdropPath: r.backdrop_path ?? null,
      releaseDate: date ?? null,
      year,
      voteAverage: r.vote_average ?? null,
      popularity: null,
      // Wildcards skip the enrich step so the genre list is empty
      // (we'd need a per-id fetch to resolve genre_ids → names). The
      // UI handles a missing genre line gracefully.
      genres: [],
      providers: [],
      // Score doesn't matter — wildcards are spliced in at fixed
      // positions, not ranked.
      recommendationScore: 0,
      reason: 'Outside your usual taste',
      isWildcard: true,
    });
  }
  return out;
}

/**
 * Builds a Set of genre IDs that appeared on recently passed titles.
 * Enrichment is bounded — we only inspect the most recent 12 passes so
 * a long-time user doesn't get crushed under a slowly accumulating
 * penalty pool.
 */
async function tallyPassedGenres(
  passed: { titleId: string; titleType: 'movie' | 'tv' }[],
): Promise<Set<number>> {
  const RECENT = passed.slice(0, 12);
  const out = new Set<number>();
  if (RECENT.length === 0) return out;

  await Promise.all(
    RECENT.map(async (p) => {
      try {
        const raw = await tmdbFetch<{
          genres?: { id: number }[];
        }>(`/${p.titleType}/${p.titleId}`);
        for (const g of raw.genres ?? []) out.add(g.id);
      } catch {
        // Skip — a failed lookup doesn't break the deck.
      }
    }),
  );
  return out;
}

/**
 * Popular titles (mix of movie + tv) as RankedCandidates — the whole pool
 * for users with no taste data, and the top-up when seeds run thin. Each
 * item has `score = 1` (no seed overlap) and no seed; the swipe scorer
 * drives off provider + rating.
 *
 * Pages through TMDB /popular until `want` undecided titles are found (or
 * POPULAR_MAX_PAGES), so once page 1 has been swiped, later pages take
 * over automatically — no client cursor needed. Pages are server-cached
 * (~1h), so revisits are cheap.
 */
async function popularFallback(
  region: string,
  excludeSet: Set<string>,
  want: number,
): Promise<RankedCandidate[]> {
  // Lazy require to avoid a cycle with services/tmdb (which imports
  // services/preferences which imports services/forYou which would
  // import us if we sat in that graph).
  const { movie, tv } = await import('@/server/tmdb');

  const out: RankedCandidate[] = [];
  const seen = new Set<string>();
  const push = (r: { id: number }, type: 'movie' | 'tv') => {
    const key = `${type}:${r.id}`;
    if (seen.has(key) || excludeSet.has(key)) return;
    seen.add(key);
    out.push({ tmdbId: r.id, mediaType: type, score: 1, topSeed: null });
  };

  for (let page = 1; page <= POPULAR_MAX_PAGES && out.length < want; page++) {
    const [movies, shows] = await Promise.all([
      movie.popular({ page, region }).catch(() => ({ results: [] })),
      tv.popular({ page, region }).catch(() => ({ results: [] })),
    ]);
    if (movies.results.length === 0 && shows.results.length === 0) break;

    // Interleave so the deck alternates movie + tv visually.
    const max = Math.max(movies.results.length, shows.results.length);
    for (let i = 0; i < max; i++) {
      if (movies.results[i]) {
        // Use the mapper to align shape with what gatherCandidates returns.
        const m = mapMovie({ ...movies.results[i], media_type: 'movie' });
        push(m, 'movie');
      }
      if (shows.results[i]) {
        const t = mapTv({ ...shows.results[i], media_type: 'tv' });
        push(t, 'tv');
      }
    }
  }
  return out;
}
