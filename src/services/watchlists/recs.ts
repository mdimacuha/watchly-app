import 'server-only';

import { unstable_cache } from 'next/cache';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { watchlistItems, watchlists } from '@/db/schema';
import { mapWithConcurrency } from '@/lib/concurrency';
import { NotFoundAppError } from '@/utils/errors';
import { buildSeeds, enrichCandidate, loadExcludeSet, pickSeeds, type EnrichedCandidate, type RankedCandidate, type Seed } from '@/services/forYou';
import { movie, tv } from '@/server/tmdb';
import { forYouTag } from '@/services/forYou/cacheTag';
import type { ForYouProvider } from '@/services/forYou';

/**
 * "More for this list": picks for one of the owner's watchlists.
 * The LIST leads: candidates come only from the list's own titles (up to 6
 * as seeds, via TMDB recommendations). The owner's taste only
 * re-ranks them and never brings a title in by itself. Never suggests
 * anything already on the list, seen, swiped or on another of their lists.
 * Reasons are only ever what was computed: the list title that brought it
 * in, and a second line when one of the owner's own titles shares its
 * director or a lead actor.
 */

export interface ListRec {
  key: string;
  mediaType: 'movie' | 'tv';
  tmdbId: number;
  title: string;
  year: string | null;
  posterPath: string | null;
  runtimeMinutes: number | null;
  genres: string[];
  providers: ForYouProvider[];
  /** Streaming availability was checked and there's none in the region. */
  notInRegion: boolean;
  /** The list title that brought it in. */
  seedTitle: string;
  /** `${mediaType}:${id}` of that list title. */
  seedKey: string;
  /** How many of the list's seeds suggested it. */
  seedCount: number;
  /** "Same director as Aftersun" — only when literally true. */
  tasteLine: string | null;
}

/** `done`: no later round can bring anything (every title and page tried). */
export type ListRecsResult = { status: 'ok'; picks: ListRec[]; done?: boolean } | { status: 'thin'; need: number };

const LIST_SEEDS = 6;
const ENRICH_TOP = 36;
const MIN_ITEMS = 2;
const MAX_TMDB_PAGE = 3;

function fingerprint(keys: string[]): string {
  let h = 5381;
  for (const ch of [...keys].sort().join('|')) h = ((h << 5) + h + ch.charCodeAt(0)) | 0;
  return (h >>> 0).toString(36);
}

/**
 * Candidates from the list's own titles. TMDB's /recommendations only (what
 * people who liked a title went on to like), never /similar: similar matches
 * loosely on genre and keywords, and put Garfield under Poor Things. Thinly
 * rated titles are dropped. Score: how many list titles suggest it, each
 * weighted by how high it sat in that title's own recommendations.
 */
async function gatherFromList(seeds: Seed[], exclude: Set<string>, tmdbPage: number): Promise<(RankedCandidate & { weight: number })[]> {
  const perSeed = await mapWithConcurrency(seeds, 6, async (seed) => {
    const page = await (seed.mediaType === 'movie' ? movie.recommendations(seed.tmdbId, tmdbPage) : tv.recommendations(seed.tmdbId, tmdbPage)).catch(() => null);
    return { seed, results: page?.results ?? [] };
  });
  const tally = new Map<string, RankedCandidate & { weight: number }>();
  for (const { seed, results } of perSeed) {
    results.forEach((r, pos) => {
      const key = `${r.mediaType}:${r.id}`;
      if (exclude.has(key)) return;
      // TMDB's lists are noisy: keep titles enough people rated, and rated well.
      if ((r.voteCount ?? 0) < 100 || r.voteAverage < 6.4) return;
      const w = 1 - pos / Math.max(results.length, 1);
      const at = tally.get(key);
      if (at) {
        at.score += 1;
        at.weight += w;
      } else {
        tally.set(key, { tmdbId: r.id, mediaType: r.mediaType, score: 1, weight: w, topSeed: seed });
      }
    });
  }
  return [...tally.values()].sort((a, b) => b.score - a.score || b.weight - a.weight);
}

const overlap = (a: Set<number>, b: Set<number>) => {
  let n = 0;
  for (const x of a) if (b.has(x)) n++;
  return n;
};

/**
 * Which list titles seed a round, and which page of their suggestions.
 * Round 0 = the list's first 6 titles, round 1 the next 6, and so on; once
 * every title has been a seed, the rounds move to page 2 of their
 * suggestions, then page 3. Null = nothing left to try.
 */
function roundPlan(n: number, round: number): { from: number; page: number } | null {
  const perPage = Math.max(1, Math.ceil(n / LIST_SEEDS));
  const page = Math.floor(round / perPage) + 1;
  if (page > MAX_TMDB_PAGE) return null;
  return { from: (round % perPage) * LIST_SEEDS, page };
}

async function build(userId: string, watchlistId: string, region: string, round: number): Promise<ListRecsResult> {
  const items = await db
    .select({ mediaType: watchlistItems.mediaType, mediaId: watchlistItems.mediaId })
    .from(watchlistItems)
    .where(eq(watchlistItems.watchlistId, watchlistId))
    // The list's own lead titles first: ranked order, then newest.
    .orderBy(sql`${watchlistItems.rankedAt} is null`, desc(watchlistItems.sortOrder), desc(watchlistItems.createdAt));
  if (items.length < MIN_ITEMS) return { status: 'thin', need: MIN_ITEMS - items.length };

  const all = items.map((i) => ({ tmdbId: Number(i.mediaId), mediaType: i.mediaType })).filter((s) => Number.isFinite(s.tmdbId));
  const plan = roundPlan(all.length, round);
  if (!plan) return { status: 'ok', picks: [], done: true };
  const stubs = all.slice(plan.from, plan.from + LIST_SEEDS);
  const [listSeeds, exclude, tasteSeeds] = await Promise.all([buildSeeds(stubs), loadExcludeSet(userId), pickSeeds(userId)]);
  // The whole list, not just a page of it (loadExcludeSet has every list too).
  for (const i of items) exclude.add(`${i.mediaType}:${i.mediaId}`);

  const ranked = (await gatherFromList(listSeeds, exclude, plan.page)).slice(0, ENRICH_TOP);
  const enriched = (await mapWithConcurrency(ranked, 8, (c) => enrichCandidate(c, region))).map((e, i) => ({ e, c: ranked[i] }));

  // What this list is about: the features its own seed titles share.
  const listF = {
    genreIds: new Set(listSeeds.flatMap((s) => [...s.genreIds])),
    keywordIds: new Set(listSeeds.flatMap((s) => [...s.keywordIds])),
    castIds: new Set(listSeeds.flatMap((s) => [...s.castIds])),
    directorIds: new Set(listSeeds.flatMap((s) => [...s.directorIds])),
  };

  // Taste: the owner's own titles that aren't on this list.
  const onList = new Set(items.map((i) => `${i.mediaType}:${i.mediaId}`));
  const taste = tasteSeeds.filter((s) => !onList.has(`${s.mediaType}:${s.tmdbId}`));
  const union = {
    genreIds: new Set(taste.flatMap((s) => [...s.genreIds])),
    keywordIds: new Set(taste.flatMap((s) => [...s.keywordIds])),
    castIds: new Set(taste.flatMap((s) => [...s.castIds])),
    directorIds: new Set(taste.flatMap((s) => [...s.directorIds])),
  };
  const tasteLine = (e: EnrichedCandidate): string | null => {
    const byDirector = taste.find((s: Seed) => overlap(e.features.directorIds, s.directorIds) > 0);
    if (byDirector) return `Same director as ${byDirector.title}`;
    const byCast = taste.find((s: Seed) => overlap(e.features.castIds, s.castIds) > 0);
    return byCast ? `Shares a lead with ${byCast.title}` : null;
  };

  const picks = enriched
    .filter((x): x is { e: EnrichedCandidate; c: (typeof ranked)[number] } => x.e !== null && !!x.e.ui.title && !!x.c.topSeed)
    .map(({ e, c }) => {
      const f = e.features;
      // The list leads: how many of its titles suggest this, and how much it
      // shares with them (keywords, people, genre), with a floor on rating.
      // Taste only nudges, at a third of the list's weight.
      const listFit =
        c.score * 6 +
        c.weight * 3 +
        3 * Math.min(overlap(f.keywordIds, listF.keywordIds), 4) +
        4 * Math.min(overlap(f.directorIds, listF.directorIds), 1) +
        2 * Math.min(overlap(f.castIds, listF.castIds), 2) +
        Math.min(overlap(f.genreIds, listF.genreIds), 2) +
        2 * Math.max(0, f.voteAverage - 6.4);
      const tasteFit =
        3 * Math.min(overlap(f.directorIds, union.directorIds), 1) +
        Math.min(overlap(f.keywordIds, union.keywordIds), 3) +
        Math.min(overlap(f.castIds, union.castIds), 2);
      const score = listFit + tasteFit / 3;
      const rec: ListRec = {
        key: `${c.mediaType}:${c.tmdbId}`,
        mediaType: c.mediaType,
        tmdbId: c.tmdbId,
        title: e.ui.title,
        year: e.ui.year,
        posterPath: e.ui.posterPath,
        runtimeMinutes: e.ui.runtimeMinutes,
        genres: e.ui.genres.slice(0, 2),
        providers: e.ui.providers.slice(0, 2),
        notInRegion: !!e.ui.availabilityChecked,
        seedTitle: c.topSeed!.title,
        seedKey: `${c.topSeed!.mediaType}:${c.topSeed!.tmdbId}`,
        seedCount: c.score,
        tasteLine: tasteLine(e),
      };
      return { rec, score };
    })
    .sort((a, b) => b.score - a.score)
    .map((x) => x.rec);

  return { status: 'ok', picks, done: roundPlan(all.length, round + 1) === null };
}

/**
 * Owner-only. `round` asks for more (see roundPlan). Cached per owner,
 * list contents, region and round (1h): any change
 * to the list makes a new key; taste changes bust it via the For You tag.
 */
export async function getListRecs(userId: string, watchlistId: string, region: string, round = 0): Promise<ListRecsResult> {
  const [list] = await db.select({ id: watchlists.id }).from(watchlists).where(and(eq(watchlists.id, watchlistId), eq(watchlists.userId, userId))).limit(1);
  if (!list) throw new NotFoundAppError('Watchlist not found');
  const keys = await db.select({ t: watchlistItems.mediaType, id: watchlistItems.mediaId }).from(watchlistItems).where(eq(watchlistItems.watchlistId, watchlistId));
  const fp = fingerprint(keys.map((k) => `${k.t}:${k.id}`));
  return unstable_cache(() => build(userId, watchlistId, region, round), ['list-recs-v4', userId, watchlistId, region, fp, String(round)], {
    revalidate: 3600,
    tags: [forYouTag(userId)],
  })();
}
