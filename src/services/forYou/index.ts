import 'server-only';

import { db } from '@/db';
import {
  userFavorites,
  watchlistItems,
  watchlists,
} from '@/db/schema';
import { and, eq, desc } from 'drizzle-orm';
import { movie, tv, trending } from '@/server/tmdb';
import { tmdbFetch } from '@/server/tmdb/client';
import { cleanProviderName } from '@/utils/providers';
import { formatRelativeAgo } from '@/lib/format';
import { getWatchedKeySet } from '@/services/watched';
import { getSelectedProviders } from '@/services/preferences/forYouPrefs';
import { mapWithConcurrency } from '@/lib/concurrency';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ForYouProvider {
  providerId: number;
  providerName: string;
  logoPath: string | null;
}

export interface ForYouCandidate {
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
  year: string | null;
  voteAverage: number;
  overview: string;
  runtimeMinutes: number | null;
  /** Genre name list — used by the hero "Sci-Fi, Thriller" line. */
  genres: string[];
  /** Reason copy shown above the title in hero or as a tooltip on cards. */
  reason?: string;
  /** Optional subtitle below the card title (e.g. "Max · Added 2d ago"). */
  subtitle?: string;
  /** Streaming providers in the user's region (flatrate only). */
  providers: ForYouProvider[];
}

export type ForYouRowId =
  | 'from_favorites'
  | 'because_added'
  | 'up_next'
  | 'popular_right_now'
  | 'trending_this_week'
  | 'quick_picks';

export interface ForYouRow {
  id: ForYouRowId;
  title: string;
  subtitle?: string;
  items: ForYouCandidate[];
}

export interface ForYouFeed {
  hero: ForYouCandidate | null;
  rows: ForYouRow[];
}

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

const SEED_LIMIT = 10;
const ROW_SIZE = 18;
// Scoring pool: take the top-N candidates from the cheap recommendations/
// similar tally, then run the full additive formula on this slice. Bounds
// the metadata-fetch cost (keywords + credits + providers per candidate)
// while still giving us enough headroom for re-ranking to matter.
const SCORING_POOL = 40;
const SEEDS_FOR_BECAUSE_ROWS = 3;

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

/**
 * Internal-but-shared seed shape. Exported so the swipe-discovery
 * pipeline can reuse the same pickSeeds → gatherCandidates → enrich
 * helpers without rewriting the scoring engine.
 */
export interface Seed {
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  /** Display name — used to compose the "Because you liked X" reason. */
  title: string;
  /** Genre IDs — drive the +5 same-genre bonus. */
  genreIds: Set<number>;
  /** Keyword IDs — drive the +4 same-keyword bonus. */
  keywordIds: Set<number>;
  /** Top-N cast member IDs — drive the +3 same-cast bonus. */
  castIds: Set<number>;
  /** Director (movie) / created_by (tv) IDs — drive the +4 same-director bonus. */
  directorIds: Set<number>;
}

/**
 * Combined feature pool across all of the user's seeds. Each Set is the
 * union of the matching field on every seed — a candidate's score is
 * computed by how many of these the candidate overlaps with.
 */
interface SeedFeatureUnion {
  genreIds: Set<number>;
  keywordIds: Set<number>;
  castIds: Set<number>;
  directorIds: Set<number>;
}

export function unionSeedFeatures(seeds: Seed[]): SeedFeatureUnion {
  const union: SeedFeatureUnion = {
    genreIds: new Set(),
    keywordIds: new Set(),
    castIds: new Set(),
    directorIds: new Set(),
  };
  for (const s of seeds) {
    for (const id of s.genreIds) union.genreIds.add(id);
    for (const id of s.keywordIds) union.keywordIds.add(id);
    for (const id of s.castIds) union.castIds.add(id);
    for (const id of s.directorIds) union.directorIds.add(id);
  }
  return union;
}

/**
 * Builds the For You feed for a user. Seeds come from the user's recent
 * favorites + watchlist items. For each seed we hit TMDB /recommendations
 * (1h-cached) and tally how many seeds each candidate appears in — that
 * tally is the v1 score. The hero is the top candidate (or a different one
 * if `excludeTmdbId` is supplied, for Spin Again).
 */
export async function getForYouFeed(
  userId: string,
  region: string,
  options: {
    excludeTmdbId?: number;
    excludeMediaType?: 'movie' | 'tv';
    /**
     * Additional `"mediaType:tmdbId"` keys to exclude. Used by Spin Again to
     * accumulate every hero the user has rotated through this session so
     * the spin doesn't loop between two titles when seeds are sparse.
     */
    excludeKeys?: string[];
  } = {},
): Promise<ForYouFeed> {
  // Seeds, exclude set, and provider prefs are independent reads keyed only
  // by userId — fetch them concurrently instead of one-after-another.
  const [seeds, excludeSet, selectedProviders] = await Promise.all([
    pickSeeds(userId),
    loadExcludeSet(userId),
    getSelectedProviders(userId),
  ]);
  if (options.excludeTmdbId && options.excludeMediaType) {
    excludeSet.add(`${options.excludeMediaType}:${options.excludeTmdbId}`);
  }
  if (options.excludeKeys) {
    for (const k of options.excludeKeys) excludeSet.add(k);
  }

  // Provider filter: when set, candidates without ANY of the user's
  // selected providers in their region drop out of the feed. null = no
  // filter, render any-region behavior.
  const selectedProviderSet = selectedProviders
    ? new Set<number>(selectedProviders)
    : null;

  // Pre-fetch trending today once — drives the +1 trending bonus in the
  // scoring formula. Set of "movie:123" / "tv:456" keys.
  const trendingSetPromise = loadTrendingTodaySet();

  // Passed-genre set — used to gently down-rank candidates whose genres
  // overlap with titles the user recently passed on in the swipe deck.
  // Loaded in parallel with the other slow paths.
  const passedGenresPromise = loadPassedGenreSet(userId);

  // "Because You Added" and "Quick Picks" only read the (now-finalized)
  // excludeSet/seeds/region — no dependency on the scoring pool — so kick
  // them off now and resolve them inside the main Promise.all rather than
  // serially after the rest of the feed assembles.
  const becauseRowsPromise = getBecauseAddedRows(
    seeds.slice(0, SEEDS_FOR_BECAUSE_ROWS),
    excludeSet,
    region,
  );
  const quickPicksPromise = getQuickPicksRow(
    region,
    excludeSet,
    selectedProviderSet,
  );

  // From-favorites pool drives both the hero AND the first row, so we
  // gather once, score, then slice.
  const tally =
    seeds.length > 0 ? await gatherCandidates(seeds, excludeSet) : [];

  const seedFeatures = unionSeedFeatures(seeds);
  const scoringPool = tally.slice(0, SCORING_POOL);

  const [
    trendingSet,
    passedGenres,
    scored,
    upNext,
    popularNow,
    trendingWeek,
    becauseRows,
    quickPicks,
  ] = await Promise.all([
    trendingSetPromise,
    passedGenresPromise,
    Promise.all(scoringPool.map((c) => enrichCandidate(c, region))),
    getUpNextRow(userId, region),
    getPopularRightNowRow(region, excludeSet, selectedProviderSet),
    getTrendingThisWeekRow(region, excludeSet, selectedProviderSet),
    becauseRowsPromise,
    quickPicksPromise,
  ]);

  // Apply the additive scoring formula on the enriched pool, then re-rank.
  const finalRanking = (
    scored
      .filter((s): s is EnrichedCandidate => s !== null)
      .filter((s) => matchesProviderFilter(s.ui.providers, selectedProviderSet))
  )
    .map((ec, idx) => ({
      ec,
      score: scoreCandidate(ec, seedFeatures, trendingSet, {
        // Tally-rank tiebreaker — preserves the "appears in many seeds'
        // recs" signal as a small floor when other features tie.
        tallyRank: idx,
        passedGenres,
      }),
    }))
    .sort((a, b) => b.score - a.score);

  const hero = finalRanking[0]?.ec.ui ?? null;
  const fromFavorites = finalRanking
    .slice(1, ROW_SIZE + 1)
    .map((r) => r.ec.ui);

  // `becauseRows` and `quickPicks` were resolved in the Promise.all above.

  // Row order on the page:
  //   1. From Your Favorites      (personal, top of fold)
  //   2. Quick Picks              (light, filterable — easy entry point)
  //   3. Because You Added X...   (deeper personal context, up to 3)
  //   4. Up Next                  (user's own watchlist intent)
  //   5. Popular Right Now        (regional discovery)
  //   6. Trending This Week       (broader discovery)
  const rows: ForYouRow[] = [];
  if (fromFavorites.length > 0) {
    rows.push({
      id: 'from_favorites',
      title: 'Your Taste',
      items: fromFavorites,
    });
  }
  if (quickPicks.length > 0) {
    rows.push({
      id: 'quick_picks',
      title: 'Quick Picks',
      items: quickPicks,
    });
  }
  for (const r of becauseRows) rows.push(r);
  if (upNext.length > 0) {
    rows.push({
      id: 'up_next',
      title: 'Up Next From Your Watchlists',
      items: upNext,
    });
  }
  if (popularNow.length > 0) {
    rows.push({
      id: 'popular_right_now',
      title: 'Popular Right Now',
      items: popularNow,
    });
  }
  if (trendingWeek.length > 0) {
    rows.push({
      id: 'trending_this_week',
      title: 'Trending This Week',
      items: trendingWeek,
    });
  }

  return { hero, rows };
}

// ---------------------------------------------------------------------------
// Scoring — additive formula from the spec
// ---------------------------------------------------------------------------

const HIGH_RATING_THRESHOLD = 7.5;

/**
 * Additive scoring per the spec:
 *   +5 per genre overlap with any seed
 *   +4 per keyword overlap
 *   +4 per matching director
 *   +3 per matching major cast member
 *   +3 if available on flatrate in the user's region
 *   +2 if vote_average >= 7.5
 *   +1 if trending today
 *   plus a small tally-rank floor so candidates that came from many seeds'
 *   recs/similar lists don't get steamrolled by metadata ties.
 *
 * Genre/keyword/cast use total overlap count so a candidate sharing 3
 * genres scores higher than one sharing 1. That's an intentional tweak
 * over the spec's "+5 if any" reading — feels closer to "how similar is
 * this to my taste."
 */
export function scoreCandidate(
  ec: EnrichedCandidate,
  seedF: SeedFeatureUnion,
  trendingSet: Set<string>,
  opts: { tallyRank: number; passedGenres: Set<number> },
): number {
  const c = ec.features;
  let s = 0;
  s += 5 * countOverlap(c.genreIds, seedF.genreIds);
  s += 4 * countOverlap(c.keywordIds, seedF.keywordIds);
  s += 4 * countOverlap(c.directorIds, seedF.directorIds);
  s += 3 * countOverlap(c.castIds, seedF.castIds);
  if (c.hasRegionFlatrate) s += 3;
  if (c.voteAverage >= HIGH_RATING_THRESHOLD) s += 2;
  if (trendingSet.has(`${ec.ui.mediaType}:${ec.ui.tmdbId}`)) s += 1;
  // Passed-genre penalty: subtract 1 per overlapping genre with recent
  // swipe-deck passes, capped at 3 so a user with a noisy passes list
  // doesn't end up with a totally empty For You feed.
  s -= Math.min(countOverlap(c.genreIds, opts.passedGenres), 3);
  // Tally floor: 0.5 / (rank+1) so the first tally entry adds 0.5, the
  // 40th adds ~0.012 — meaningful only at exact ties.
  s += 0.5 / (opts.tallyRank + 1);
  return s;
}

/**
 * Builds the set of genre IDs that appeared on recently passed titles
 * (from title_swipes). Bounded to the most recent 12 passes so the
 * penalty doesn't grow without limit over time.
 *
 * Uses TMDB detail lookups which share the 1h cache with the rest of
 * the pipeline — most pass-genre fetches will already be warm because
 * the user saw those same titles in the deck before passing.
 */
export async function loadPassedGenreSet(userId: string): Promise<Set<number>> {
  const { getSwipeSignals } = await import('@/services/swipe');
  const signals = await getSwipeSignals(userId);
  const recent = signals.passed.slice(0, 12);
  const out = new Set<number>();
  if (recent.length === 0) return out;
  await Promise.all(
    recent.map(async (p) => {
      try {
        const raw = await tmdbFetch<{ genres?: { id: number }[] }>(
          `/${p.titleType}/${p.titleId}`,
        );
        for (const g of raw.genres ?? []) out.add(g.id);
      } catch {
        // Bad TMDB id or transient fail — skip; the penalty just won't
        // include this title's genres this round.
      }
    }),
  );
  return out;
}

function countOverlap(a: Set<number>, b: Set<number>): number {
  let count = 0;
  for (const x of a) if (b.has(x)) count++;
  return count;
}

/**
 * True when the candidate's providers include at least one of the user's
 * selected providers — or when no filter is set (selectedProviderSet=null
 * → "any provider in my region", short-circuits to true).
 */
export function matchesProviderFilter(
  providers: ForYouProvider[],
  selected: Set<number> | null,
): boolean {
  if (!selected) return true;
  for (const p of providers) {
    if (selected.has(p.providerId)) return true;
  }
  return false;
}

interface TrendingItem {
  id: number;
  mediaType: 'movie' | 'tv' | 'person';
}

export async function loadTrendingTodaySet(): Promise<Set<string>> {
  try {
    const r = await trending.all('day');
    const set = new Set<string>();
    for (const item of r.results as TrendingItem[]) {
      if (item.mediaType !== 'movie' && item.mediaType !== 'tv') continue;
      set.add(`${item.mediaType}:${item.id}`);
    }
    return set;
  } catch {
    return new Set();
  }
}

// ---------------------------------------------------------------------------
// Seed gathering
// ---------------------------------------------------------------------------

// TMDB shapes (subset of what /details with credits+keywords returns).
interface SeedRawMovie {
  title?: string;
  genres?: { id: number; name: string }[];
  credits?: {
    cast?: { id: number; order?: number }[];
    crew?: { id: number; job?: string }[];
  };
  keywords?: { keywords?: { id: number }[] };
}
interface SeedRawTv {
  name?: string;
  genres?: { id: number; name: string }[];
  credits?: {
    cast?: { id: number; order?: number }[];
    crew?: { id: number; job?: string }[];
  };
  keywords?: { results?: { id: number }[] };
  created_by?: { id: number }[];
}

const CAST_TOP_N = 5;

/**
 * Recent favorites + recent watchlist items, dedup'd + enriched with the
 * features the scoring formula consumes (genres, keywords, top cast,
 * director). One TMDB call per seed via append_to_response — same number
 * of round-trips as before, just with more data per response.
 */
export async function pickSeeds(userId: string): Promise<Seed[]> {
  const stub = new Map<
    string,
    Pick<Seed, 'tmdbId' | 'mediaType'>
  >();

  // Favorites first — they're a stronger signal than "saved for later."
  const favs = await db
    .select({
      favoriteId: userFavorites.favoriteId,
      favoriteType: userFavorites.favoriteType,
    })
    .from(userFavorites)
    .where(eq(userFavorites.userId, userId))
    .orderBy(desc(userFavorites.createdAt))
    .limit(SEED_LIMIT);

  for (const f of favs) {
    if (f.favoriteType !== 'movie' && f.favoriteType !== 'tv') continue;
    const id = parseInt(f.favoriteId, 10);
    if (!Number.isFinite(id)) continue;
    const key = `${f.favoriteType}:${id}`;
    if (!stub.has(key)) stub.set(key, { tmdbId: id, mediaType: f.favoriteType });
  }

  if (stub.size < SEED_LIMIT) {
    // Top up with recent watchlist items the user has shown intent on.
    const items = await db
      .select({
        mediaId: watchlistItems.mediaId,
        mediaType: watchlistItems.mediaType,
      })
      .from(watchlistItems)
      .innerJoin(watchlists, eq(watchlists.id, watchlistItems.watchlistId))
      .where(eq(watchlists.userId, userId))
      .orderBy(desc(watchlistItems.createdAt))
      .limit(SEED_LIMIT * 2);

    for (const it of items) {
      if (stub.size >= SEED_LIMIT) break;
      const id = parseInt(it.mediaId, 10);
      if (!Number.isFinite(id)) continue;
      const key = `${it.mediaType}:${id}`;
      if (!stub.has(key)) stub.set(key, { tmdbId: id, mediaType: it.mediaType });
    }
  }

  if (stub.size < SEED_LIMIT) {
    // Finally, top up with swipe signals — saved + liked titles count
    // as seeds with the same weight as favorites / watchlist items.
    // Saved comes first since it implies stronger intent than a Like.
    const { getSwipeSignals } = await import('@/services/swipe');
    const swipeSignals = await getSwipeSignals(userId);
    const swipeSeeds = [...swipeSignals.saved, ...swipeSignals.liked];
    for (const s of swipeSeeds) {
      if (stub.size >= SEED_LIMIT) break;
      if (s.titleType !== 'movie' && s.titleType !== 'tv') continue;
      const id = parseInt(s.titleId, 10);
      if (!Number.isFinite(id)) continue;
      const key = `${s.titleType}:${id}`;
      if (!stub.has(key)) stub.set(key, { tmdbId: id, mediaType: s.titleType });
    }
  }

  // Pull details + credits + keywords in one call each. 1h-cached.
  const enriched = await Promise.all(
    Array.from(stub.values()).map(async (s): Promise<Seed | null> => {
      try {
        const raw =
          s.mediaType === 'movie'
            ? await tmdbFetch<SeedRawMovie>(
                `/${s.mediaType}/${s.tmdbId}`,
                { append_to_response: 'credits,keywords' },
              )
            : await tmdbFetch<SeedRawTv>(
                `/${s.mediaType}/${s.tmdbId}`,
                { append_to_response: 'credits,keywords' },
              );
        return {
          tmdbId: s.tmdbId,
          mediaType: s.mediaType,
          title:
            s.mediaType === 'movie'
              ? (raw as SeedRawMovie).title ?? ''
              : (raw as SeedRawTv).name ?? '',
          genreIds: new Set((raw.genres ?? []).map((g) => g.id)),
          keywordIds: extractKeywordIds(s.mediaType, raw),
          castIds: extractCastIds(raw),
          directorIds: extractDirectorIds(s.mediaType, raw),
        };
      } catch {
        return null;
      }
    }),
  );

  return enriched.filter((s): s is Seed => s !== null);
}

function extractKeywordIds(
  mediaType: 'movie' | 'tv',
  raw: SeedRawMovie | SeedRawTv,
): Set<number> {
  // movie returns `keywords.keywords[]`, tv returns `keywords.results[]`.
  const list =
    mediaType === 'movie'
      ? (raw as SeedRawMovie).keywords?.keywords ?? []
      : (raw as SeedRawTv).keywords?.results ?? [];
  return new Set(list.map((k) => k.id));
}

function extractCastIds(raw: SeedRawMovie | SeedRawTv): Set<number> {
  const cast = raw.credits?.cast ?? [];
  // Top N by order (TMDB returns cast already roughly ordered by billing).
  const sorted = [...cast].sort(
    (a, b) => (a.order ?? 999) - (b.order ?? 999),
  );
  return new Set(sorted.slice(0, CAST_TOP_N).map((c) => c.id));
}

function extractDirectorIds(
  mediaType: 'movie' | 'tv',
  raw: SeedRawMovie | SeedRawTv,
): Set<number> {
  if (mediaType === 'movie') {
    const crew = (raw as SeedRawMovie).credits?.crew ?? [];
    return new Set(
      crew.filter((c) => c.job === 'Director').map((c) => c.id),
    );
  }
  // TV: "created_by" is the showrunner-equivalent.
  return new Set(
    ((raw as SeedRawTv).created_by ?? []).map((p) => p.id),
  );
}

/**
 * The full set of (mediaType, tmdbId) the user has already engaged with —
 * favorites, watchlist items (any status). Candidates in this set are
 * filtered out so we never recommend something the user has already saved.
 */
export async function loadExcludeSet(userId: string): Promise<Set<string>> {
  const set = new Set<string>();

  const favs = await db
    .select({
      favoriteId: userFavorites.favoriteId,
      favoriteType: userFavorites.favoriteType,
    })
    .from(userFavorites)
    .where(eq(userFavorites.userId, userId));
  for (const f of favs) {
    if (f.favoriteType === 'movie' || f.favoriteType === 'tv') {
      set.add(`${f.favoriteType}:${f.favoriteId}`);
    }
  }

  const items = await db
    .select({
      mediaId: watchlistItems.mediaId,
      mediaType: watchlistItems.mediaType,
    })
    .from(watchlistItems)
    .innerJoin(watchlists, eq(watchlists.id, watchlistItems.watchlistId))
    .where(eq(watchlists.userId, userId));
  for (const it of items) {
    set.add(`${it.mediaType}:${it.mediaId}`);
  }

  // "Watched" entries from the dedicated table (titles the user marked
  // watched without putting in a list). Finished-status watchlist items
  // are already covered by the watchlist loop above.
  const watchedKeys = await getWatchedKeySet(userId);
  for (const key of watchedKeys) set.add(key);

  // Titles the user decided on in the swipe UI (liked, passed, saved)
  // shouldn't reappear in the For You feed. "opened" is only a Quick View
  // peek, not a decision, so it doesn't hide a title.
  const { getSwipeKeySet, DECIDED_SWIPE_ACTIONS } = await import('@/services/swipe');
  const swipeKeys = await getSwipeKeySet(userId, DECIDED_SWIPE_ACTIONS);
  for (const key of swipeKeys) set.add(key);

  return set;
}

// ---------------------------------------------------------------------------
// Candidate gathering + scoring
// ---------------------------------------------------------------------------

export interface RankedCandidate {
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  /** How many seeds this candidate appeared in. */
  score: number;
  /** The single seed that contributed the most "weight" — used for reason copy. */
  topSeed: Seed | null;
}

export async function gatherCandidates(
  seeds: Seed[],
  excludeSet: Set<string>,
): Promise<RankedCandidate[]> {
  // For each seed pull BOTH /recommendations (curated editorial picks) and
  // /similar (genre+keyword-derived). A candidate that shows up in both
  // for the same seed scores 2; one that shows up across multiple seeds
  // scores even higher. Each call is 1h-cached server-side.
  const perSeed = await Promise.all(
    seeds.map(async (s) => {
      const [recs, sims] = await Promise.all([
        (s.mediaType === 'movie'
          ? movie.recommendations(s.tmdbId)
          : tv.recommendations(s.tmdbId)
        )
          .then((r) => r.results)
          .catch(() => []),
        (s.mediaType === 'movie'
          ? movie.similar(s.tmdbId)
          : tv.similar(s.tmdbId)
        )
          .then((r) => r.results)
          .catch(() => []),
      ]);
      return { seed: s, items: [...recs, ...sims] };
    }),
  );

  const tally = new Map<string, RankedCandidate>();
  for (const { seed, items } of perSeed) {
    for (const item of items) {
      const key = `${item.mediaType}:${item.id}`;
      if (excludeSet.has(key)) continue;
      const existing = tally.get(key);
      if (existing) {
        existing.score++;
      } else {
        tally.set(key, {
          tmdbId: item.id,
          mediaType: item.mediaType,
          score: 1,
          topSeed: seed,
        });
      }
    }
  }

  return Array.from(tally.values()).sort((a, b) => b.score - a.score);
}

// ---------------------------------------------------------------------------
// Enrichment — turns a ranked candidate into a card-ready ForYouCandidate
// ---------------------------------------------------------------------------

interface TmdbProviderRow {
  provider_id: number;
  provider_name: string;
  logo_path: string | null;
}

interface TmdbWatchProviders {
  results?: Record<string, { flatrate?: TmdbProviderRow[] }>;
}

interface TmdbDetailsFull {
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  vote_average?: number;
  overview?: string;
  runtime?: number;
  episode_run_time?: number[];
  genres?: { id: number; name: string }[];
  'watch/providers'?: TmdbWatchProviders;
  credits?: {
    cast?: { id: number; order?: number }[];
    crew?: { id: number; job?: string }[];
  };
  keywords?: {
    keywords?: { id: number }[];
    results?: { id: number }[];
  };
  created_by?: { id: number }[];
}

/** Candidate-side feature vector — populated from the same fetch that
 *  produces the UI shape, used by the scoring formula. */
export interface CandidateFeatures {
  genreIds: Set<number>;
  keywordIds: Set<number>;
  castIds: Set<number>;
  directorIds: Set<number>;
  hasRegionFlatrate: boolean;
  voteAverage: number;
}

export interface EnrichedCandidate {
  ui: ForYouCandidate;
  features: CandidateFeatures;
}

export async function enrichCandidate(
  c: RankedCandidate,
  region: string,
): Promise<EnrichedCandidate | null> {
  try {
    // Single fetch covers everything: UI render + scoring features. TMDB
    // caches by URL+params so this slot is shared with the seed fetches
    // when the same title appears in both contexts.
    const raw = await tmdbFetch<TmdbDetailsFull>(
      `/${c.mediaType}/${c.tmdbId}`,
      { append_to_response: 'credits,keywords,watch/providers' },
    );

    const title = raw.title ?? raw.name ?? '';
    const date = c.mediaType === 'movie' ? raw.release_date : raw.first_air_date;
    const year = date ? new Date(date).getFullYear().toString() : null;

    const runtimeMinutes =
      c.mediaType === 'movie'
        ? raw.runtime ?? null
        : raw.episode_run_time && raw.episode_run_time[0]
          ? raw.episode_run_time[0]
          : null;

    const reason =
      c.topSeed && c.topSeed.title
        ? `Because you liked ${c.topSeed.title}`
        : 'Recommended for you';

    const providers = pickRegionFlatrate(raw['watch/providers'], region);

    const ui: ForYouCandidate = {
      tmdbId: c.tmdbId,
      mediaType: c.mediaType,
      title,
      posterPath: raw.poster_path ?? null,
      backdropPath: raw.backdrop_path ?? null,
      year,
      voteAverage: raw.vote_average ?? 0,
      overview: raw.overview ?? '',
      runtimeMinutes,
      genres: (raw.genres ?? []).map((g) => g.name),
      reason,
      providers,
    };

    const features: CandidateFeatures = {
      genreIds: new Set((raw.genres ?? []).map((g) => g.id)),
      keywordIds: extractKeywordIds(c.mediaType, raw),
      castIds: extractCastIds(raw),
      directorIds: extractDirectorIds(c.mediaType, raw),
      hasRegionFlatrate: providers.length > 0,
      voteAverage: raw.vote_average ?? 0,
    };

    return { ui, features };
  } catch {
    return null;
  }
}

function pickRegionFlatrate(
  block: TmdbWatchProviders | undefined,
  region: string,
): ForYouProvider[] {
  // Region only — a US fallback showed (and scored +3 for) services the
  // user can't actually stream where they live.
  const list = block?.results?.[region]?.flatrate ?? [];
  const seen = new Set<string>();
  const out: ForYouProvider[] = [];
  for (const p of list) {
    const name = cleanProviderName(p.provider_name);
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      providerId: p.provider_id,
      providerName: name,
      logoPath: p.logo_path,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Up Next row — watchlist items the user has actively planned to watch
// ---------------------------------------------------------------------------

async function getUpNextRow(
  userId: string,
  region: string,
): Promise<ForYouCandidate[]> {
  const rows = await db
    .select({
      mediaId: watchlistItems.mediaId,
      mediaType: watchlistItems.mediaType,
      addedAt: watchlistItems.createdAt,
    })
    .from(watchlistItems)
    .innerJoin(watchlists, eq(watchlists.id, watchlistItems.watchlistId))
    .where(
      and(
        eq(watchlists.userId, userId),
        eq(watchlistItems.status, 'up_next'),
      ),
    )
    .orderBy(desc(watchlistItems.createdAt))
    .limit(ROW_SIZE);

  const items = await Promise.all(
    rows.map(async (r): Promise<ForYouCandidate | null> => {
      const id = parseInt(r.mediaId, 10);
      if (!Number.isFinite(id)) return null;
      const enriched = await enrichCandidate(
        { tmdbId: id, mediaType: r.mediaType, score: 1, topSeed: null },
        region,
      );
      if (!enriched) return null;
      return {
        ...enriched.ui,
        subtitle: `Added ${formatRelativeAgo(r.addedAt)}`,
        reason: 'Up Next',
      };
    }),
  );
  return items.filter((i): i is ForYouCandidate => i !== null);
}

// ---------------------------------------------------------------------------
// Popular Right Now — TMDB /movie/popular + /tv/popular, interleaved
// ---------------------------------------------------------------------------

async function getPopularRightNowRow(
  region: string,
  excludeSet: Set<string>,
  selectedProviderSet: Set<number> | null,
): Promise<ForYouCandidate[]> {
  const [movies, shows] = await Promise.all([
    movie
      .popular({ region })
      .then((r) => r.results)
      .catch(() => [] as Array<{ id: number; mediaType: 'movie' }>),
    tv
      .popular({ region })
      .then((r) => r.results)
      .catch(() => [] as Array<{ id: number; mediaType: 'tv' }>),
  ]);

  // 1:1 movie/tv interleave so the row reads as a mixed feed.
  const candidates: RankedCandidate[] = [];
  for (let i = 0; i < ROW_SIZE; i++) {
    const m = movies[i];
    const t = shows[i];
    if (m && !excludeSet.has(`movie:${m.id}`)) {
      candidates.push({ tmdbId: m.id, mediaType: 'movie', score: 1, topSeed: null });
    }
    if (t && !excludeSet.has(`tv:${t.id}`)) {
      candidates.push({ tmdbId: t.id, mediaType: 'tv', score: 1, topSeed: null });
    }
    if (candidates.length >= ROW_SIZE) break;
  }

  const items = await Promise.all(
    candidates.slice(0, ROW_SIZE).map((c) => enrichCandidate(c, region)),
  );
  return items
    .filter((i): i is EnrichedCandidate => i !== null)
    .filter((i) => matchesProviderFilter(i.ui.providers, selectedProviderSet))
    .map((i) => ({ ...i.ui, reason: 'Popular right now' }));
}

// ---------------------------------------------------------------------------
// Trending This Week — TMDB /trending/all/week, mixed media types
// ---------------------------------------------------------------------------

interface TrendingItem {
  id: number;
  mediaType: 'movie' | 'tv' | 'person';
}

async function getTrendingThisWeekRow(
  region: string,
  excludeSet: Set<string>,
  selectedProviderSet: Set<number> | null,
): Promise<ForYouCandidate[]> {
  const results = await trending
    .all('week')
    .then((r) => r.results as TrendingItem[])
    .catch(() => [] as TrendingItem[]);

  const candidates: RankedCandidate[] = [];
  for (const item of results) {
    // Trending mixes people too — filter to titles.
    if (item.mediaType !== 'movie' && item.mediaType !== 'tv') continue;
    if (excludeSet.has(`${item.mediaType}:${item.id}`)) continue;
    candidates.push({
      tmdbId: item.id,
      mediaType: item.mediaType,
      score: 1,
      topSeed: null,
    });
    if (candidates.length >= ROW_SIZE) break;
  }

  const items = await Promise.all(
    candidates.map((c) => enrichCandidate(c, region)),
  );
  return items
    .filter((i): i is EnrichedCandidate => i !== null)
    .filter((i) => matchesProviderFilter(i.ui.providers, selectedProviderSet))
    .map((i) => ({ ...i.ui, reason: 'Trending this week' }));
}

// ---------------------------------------------------------------------------
// Because You Added — up to 3 per-seed rows
// ---------------------------------------------------------------------------

/**
 * Builds up to N rows titled "Because you added {seedTitle}" — one per top
 * seed. Items in each row are the top recs+similar for that single seed,
 * filtered through the user's excludeSet. Used to give the feed a more
 * personal feel without flooding the page (capped at 3 rows).
 */
async function getBecauseAddedRows(
  seeds: Seed[],
  excludeSet: Set<string>,
  region: string,
): Promise<ForYouRow[]> {
  const rowsPerSeed = await Promise.all(
    seeds.map(async (s): Promise<ForYouRow | null> => {
      if (!s.title) return null;
      const [recs, sims] = await Promise.all([
        (s.mediaType === 'movie'
          ? movie.recommendations(s.tmdbId)
          : tv.recommendations(s.tmdbId)
        )
          .then((r) => r.results)
          .catch(() => []),
        (s.mediaType === 'movie'
          ? movie.similar(s.tmdbId)
          : tv.similar(s.tmdbId)
        )
          .then((r) => r.results)
          .catch(() => []),
      ]);

      const seen = new Set<string>();
      const candidates: RankedCandidate[] = [];
      for (const item of [...recs, ...sims]) {
        const key = `${item.mediaType}:${item.id}`;
        if (excludeSet.has(key) || seen.has(key)) continue;
        seen.add(key);
        candidates.push({
          tmdbId: item.id,
          mediaType: item.mediaType,
          score: 1,
          topSeed: s,
        });
        if (candidates.length >= ROW_SIZE) break;
      }

      if (candidates.length === 0) return null;

      const enriched = await Promise.all(
        candidates.map((c) => enrichCandidate(c, region)),
      );
      const items: ForYouCandidate[] = enriched
        .filter((e): e is EnrichedCandidate => e !== null)
        .map((e) => e.ui);

      if (items.length === 0) return null;

      return {
        id: 'because_added',
        title: `Because you added ${s.title}`,
        items,
      };
    }),
  );

  return rowsPerSeed.filter((r): r is ForYouRow => r !== null);
}

// ---------------------------------------------------------------------------
// Quick Picks — region-popular pool that the client can filter locally
// ---------------------------------------------------------------------------

/**
 * Pool of titles the user can drill into via client-side chip filters
 * (Under 90 min / Under 2h / Highly Rated / New This Week). We return a
 * larger superset than ROW_SIZE so chip filters have material to slice
 * down without re-fetching.
 */
async function getQuickPicksRow(
  region: string,
  excludeSet: Set<string>,
  selectedProviderSet: Set<number> | null,
): Promise<ForYouCandidate[]> {
  const [movies, shows] = await Promise.all([
    movie
      .popular({ region })
      .then((r) => r.results)
      .catch(() => [] as Array<{ id: number; mediaType: 'movie' }>),
    tv
      .popular({ region })
      .then((r) => r.results)
      .catch(() => [] as Array<{ id: number; mediaType: 'tv' }>),
  ]);

  // Interleave 1:1; cap at ROW_SIZE * 2 so the chip filters have room.
  const candidates: RankedCandidate[] = [];
  const target = ROW_SIZE * 2;
  for (let i = 0; i < target; i++) {
    const m = movies[i];
    const t = shows[i];
    if (m && !excludeSet.has(`movie:${m.id}`)) {
      candidates.push({ tmdbId: m.id, mediaType: 'movie', score: 1, topSeed: null });
    }
    if (t && !excludeSet.has(`tv:${t.id}`)) {
      candidates.push({ tmdbId: t.id, mediaType: 'tv', score: 1, topSeed: null });
    }
    if (candidates.length >= target) break;
  }

  const items = await Promise.all(
    candidates.slice(0, target).map((c) => enrichCandidate(c, region)),
  );
  return items
    .filter((i): i is EnrichedCandidate => i !== null)
    .filter((i) => matchesProviderFilter(i.ui.providers, selectedProviderSet))
    .map((i) => ({ ...i.ui, reason: 'Quick pick' }));
}

// ---------------------------------------------------------------------------
// View All pagination — per-row, offset/limit paging for the dedicated
// full-list pages.
//
// The home feed shows a capped ROW_SIZE slice of each row. These helpers
// let the "/for-you/[rowId]" pages walk *past* that cap: they page the
// (cheap, 1h-cached) candidate pool for a single row and enrich only the
// requested window. Enrichment (credits + keywords + watch/providers per
// title) is the expensive fan-out, so it's the thing we keep bounded —
// capped at ENRICH_CONCURRENCY parallel calls and never more than `limit`
// titles per page.
// ---------------------------------------------------------------------------

/**
 * Items per View All page. Deliberately larger than ROW_SIZE so the very
 * first page already shows visibly more titles than the home rail did.
 */
export const VIEW_ALL_PAGE_SIZE = 24;
/** Hard clamp on a client-supplied `limit`. */
const VIEW_ALL_MAX_LIMIT = 48;
/** Parallelism cap for the per-title enrichment fan-out on a single page. */
const ENRICH_CONCURRENCY = 5;
/**
 * Max TMDB list pages we'll walk to build a popular/trending candidate pool.
 * TMDB returns 20 results per list page; with a 1:1 movie/tv interleave, 5
 * pages ≈ 200 candidates ≈ 8 View All pages. This bounds how deep those
 * (list-endpoint-derived) rows can paginate — when we hit it without filling
 * the requested window we stop and log rather than silently pretending the
 * list simply ended.
 */
const MAX_LIST_PAGES = 5;

export interface ForYouRowPage {
  items: ForYouCandidate[];
  /** True when there are more items beyond the page just returned. */
  hasMore: boolean;
  /** Echo of the 1-based page that was served. */
  page: number;
}

/**
 * Paginated fetch for a single For You row. Returns MORE items than the
 * home rail by paging the row's candidate pool at (page-1)*limit and
 * enriching only that window. `because_added` has no dedicated page (its
 * URL isn't stable), so it returns an empty page.
 */
export async function getForYouRow(
  userId: string,
  region: string,
  rowId: ForYouRowId,
  opts: { page?: number; limit?: number } = {},
): Promise<ForYouRowPage> {
  const page = Math.max(1, Math.floor(opts.page ?? 1));
  const limit = Math.min(
    VIEW_ALL_MAX_LIMIT,
    Math.max(1, Math.floor(opts.limit ?? VIEW_ALL_PAGE_SIZE)),
  );
  const offset = (page - 1) * limit;

  switch (rowId) {
    case 'from_favorites':
      return withPage(
        page,
        await getFromFavoritesPage(userId, region, offset, limit),
      );
    case 'up_next':
      return withPage(
        page,
        await getUpNextPage(userId, region, offset, limit),
      );
    case 'popular_right_now':
      return withPage(
        page,
        await getRegionPopularPage(
          userId,
          region,
          offset,
          limit,
          'Popular right now',
          rowId,
        ),
      );
    case 'quick_picks':
      return withPage(
        page,
        await getRegionPopularPage(
          userId,
          region,
          offset,
          limit,
          'Quick pick',
          rowId,
        ),
      );
    case 'trending_this_week':
      return withPage(
        page,
        await getTrendingPage(userId, region, offset, limit, rowId),
      );
    case 'because_added':
      return { items: [], hasMore: false, page };
  }
}

function withPage(
  page: number,
  res: { items: ForYouCandidate[]; hasMore: boolean },
): ForYouRowPage {
  return { items: res.items, hasMore: res.hasMore, page };
}

/**
 * From Your Favorites — pages the full recommendation/similar tally across
 * the user's seeds. Reuses the same candidate generation the home feed uses
 * (`pickSeeds` → `gatherCandidates`); the home rail only enriches the top
 * SCORING_POOL for additive re-ranking, whereas here we page the entire
 * pool. Ordering is by recommendation frequency (how many of your seeds
 * surfaced the title), which is stable across pages so the same title never
 * shows up on two pages.
 */
async function getFromFavoritesPage(
  userId: string,
  region: string,
  offset: number,
  limit: number,
): Promise<{ items: ForYouCandidate[]; hasMore: boolean }> {
  const [seeds, excludeSet, selectedProviders] = await Promise.all([
    pickSeeds(userId),
    loadExcludeSet(userId),
    getSelectedProviders(userId),
  ]);
  if (seeds.length === 0) return { items: [], hasMore: false };
  const selectedProviderSet = selectedProviders
    ? new Set<number>(selectedProviders)
    : null;

  const tally = await gatherCandidates(seeds, excludeSet);
  const window = tally.slice(offset, offset + limit);
  const enriched = await mapWithConcurrency(window, ENRICH_CONCURRENCY, (c) =>
    enrichCandidate(c, region),
  );
  const items = enriched
    .filter((e): e is EnrichedCandidate => e !== null)
    .filter((e) => matchesProviderFilter(e.ui.providers, selectedProviderSet))
    .map((e) => e.ui);

  return { items, hasMore: tally.length > offset + limit };
}

/**
 * Up Next — a straight DB list, so it paginates cleanly with SQL
 * limit/offset. We over-fetch one row to detect whether another page
 * exists without a second COUNT query.
 */
async function getUpNextPage(
  userId: string,
  region: string,
  offset: number,
  limit: number,
): Promise<{ items: ForYouCandidate[]; hasMore: boolean }> {
  const rows = await db
    .select({
      mediaId: watchlistItems.mediaId,
      mediaType: watchlistItems.mediaType,
      addedAt: watchlistItems.createdAt,
    })
    .from(watchlistItems)
    .innerJoin(watchlists, eq(watchlists.id, watchlistItems.watchlistId))
    .where(
      and(
        eq(watchlists.userId, userId),
        eq(watchlistItems.status, 'up_next'),
      ),
    )
    .orderBy(desc(watchlistItems.createdAt))
    .limit(limit + 1)
    .offset(offset);

  const hasMore = rows.length > limit;
  const pageRows = rows.slice(0, limit);

  const items = await mapWithConcurrency(
    pageRows,
    ENRICH_CONCURRENCY,
    async (r): Promise<ForYouCandidate | null> => {
      const id = parseInt(r.mediaId, 10);
      if (!Number.isFinite(id)) return null;
      const enriched = await enrichCandidate(
        { tmdbId: id, mediaType: r.mediaType, score: 1, topSeed: null },
        region,
      );
      if (!enriched) return null;
      return {
        ...enriched.ui,
        subtitle: `Added ${formatRelativeAgo(r.addedAt)}`,
        reason: 'Up Next',
      };
    },
  );

  return {
    items: items.filter((i): i is ForYouCandidate => i !== null),
    hasMore,
  };
}

/**
 * Popular Right Now + Quick Picks — both draw from the region-popular
 * movie/tv pool, interleaved. We build the pool up to the requested window
 * (walking at most MAX_LIST_PAGES list pages), then enrich only that window.
 */
async function getRegionPopularPage(
  userId: string,
  region: string,
  offset: number,
  limit: number,
  reason: string,
  rowId: ForYouRowId,
): Promise<{ items: ForYouCandidate[]; hasMore: boolean }> {
  const [excludeSet, selectedProviders] = await Promise.all([
    loadExcludeSet(userId),
    getSelectedProviders(userId),
  ]);
  const selectedProviderSet = selectedProviders
    ? new Set<number>(selectedProviders)
    : null;

  const { pool, capped } = await buildRegionPopularPool(
    region,
    excludeSet,
    offset + limit + 1,
  );
  const window = pool.slice(offset, offset + limit);
  const enriched = await mapWithConcurrency(window, ENRICH_CONCURRENCY, (c) =>
    enrichCandidate(c, region),
  );
  const items = enriched
    .filter((e): e is EnrichedCandidate => e !== null)
    .filter((e) => matchesProviderFilter(e.ui.providers, selectedProviderSet))
    .map((e) => ({ ...e.ui, reason }));

  const hasMore = pool.length > offset + limit;
  if (!hasMore && capped) {
    console.warn(
      `[forYou] getForYouRow "${rowId}" hit MAX_LIST_PAGES=${MAX_LIST_PAGES}; ` +
        `pagination bounded at ~${pool.length} candidates.`,
    );
  }
  return { items, hasMore };
}

/**
 * Trending This Week — TMDB /trending/all/week (mixed media). Same pool +
 * window strategy as the popular rows, but a single list per page.
 */
async function getTrendingPage(
  userId: string,
  region: string,
  offset: number,
  limit: number,
  rowId: ForYouRowId,
): Promise<{ items: ForYouCandidate[]; hasMore: boolean }> {
  const [excludeSet, selectedProviders] = await Promise.all([
    loadExcludeSet(userId),
    getSelectedProviders(userId),
  ]);
  const selectedProviderSet = selectedProviders
    ? new Set<number>(selectedProviders)
    : null;

  const pool: RankedCandidate[] = [];
  const seen = new Set<string>();
  const targetCount = offset + limit + 1;
  let capped = false;

  for (let listPage = 1; listPage <= MAX_LIST_PAGES; listPage++) {
    const results = await trending
      .all('week', { page: listPage })
      .then((r) => r.results as TrendingItem[])
      .catch(() => [] as TrendingItem[]);

    for (const item of results) {
      if (item.mediaType !== 'movie' && item.mediaType !== 'tv') continue;
      pushPoolCandidate(pool, seen, excludeSet, item.id, item.mediaType);
    }

    if (pool.length >= targetCount) break;
    if (results.length === 0) break;
    if (listPage === MAX_LIST_PAGES) capped = true;
  }

  const window = pool.slice(offset, offset + limit);
  const enriched = await mapWithConcurrency(window, ENRICH_CONCURRENCY, (c) =>
    enrichCandidate(c, region),
  );
  const items = enriched
    .filter((e): e is EnrichedCandidate => e !== null)
    .filter((e) => matchesProviderFilter(e.ui.providers, selectedProviderSet))
    .map((e) => ({ ...e.ui, reason: 'Trending this week' }));

  const hasMore = pool.length > offset + limit;
  if (!hasMore && capped) {
    console.warn(
      `[forYou] getForYouRow "${rowId}" hit MAX_LIST_PAGES=${MAX_LIST_PAGES}; ` +
        `pagination bounded at ~${pool.length} candidates.`,
    );
  }
  return { items, hasMore };
}

/**
 * Walks up to MAX_LIST_PAGES of TMDB popular movies + tv, interleaved 1:1
 * and deduped, until the pool covers `targetCount` candidates (or the data
 * runs out). Returns `capped: true` when it stopped because it ran out of
 * allowed list pages — i.e. there may be more upstream that we chose not to
 * fetch — so the caller can decide whether to log a bounded-pagination note.
 */
async function buildRegionPopularPool(
  region: string,
  excludeSet: Set<string>,
  targetCount: number,
): Promise<{ pool: RankedCandidate[]; capped: boolean }> {
  const pool: RankedCandidate[] = [];
  const seen = new Set<string>();

  for (let listPage = 1; listPage <= MAX_LIST_PAGES; listPage++) {
    const [movies, shows] = await Promise.all([
      movie
        .popular({ region, page: listPage })
        .then((r) => r.results)
        .catch(() => [] as Array<{ id: number }>),
      tv
        .popular({ region, page: listPage })
        .then((r) => r.results)
        .catch(() => [] as Array<{ id: number }>),
    ]);

    const maxLen = Math.max(movies.length, shows.length);
    for (let i = 0; i < maxLen; i++) {
      const m = movies[i];
      const t = shows[i];
      if (m) pushPoolCandidate(pool, seen, excludeSet, m.id, 'movie');
      if (t) pushPoolCandidate(pool, seen, excludeSet, t.id, 'tv');
    }

    if (pool.length >= targetCount) return { pool, capped: false };
    if (movies.length === 0 && shows.length === 0) {
      return { pool, capped: false };
    }
  }
  return { pool, capped: true };
}

/** Push a candidate into a pool, skipping excluded + already-seen keys. */
function pushPoolCandidate(
  pool: RankedCandidate[],
  seen: Set<string>,
  excludeSet: Set<string>,
  tmdbId: number,
  mediaType: 'movie' | 'tv',
): void {
  const key = `${mediaType}:${tmdbId}`;
  if (excludeSet.has(key) || seen.has(key)) return;
  seen.add(key);
  pool.push({ tmdbId, mediaType, score: 1, topSeed: null });
}
