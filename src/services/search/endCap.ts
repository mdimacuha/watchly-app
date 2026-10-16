import 'server-only';

import { z } from 'zod';
import { discover, trending } from '@/server/tmdb';
import {
  enrichCandidate,
  gatherCandidates,
  loadExcludeSet,
  pickSeeds,
} from '@/services/forYou';
import { ValidationAppError } from '@/utils/errors';
import type { SearchResult } from '@/server/tmdb/types';

/**
 * The search page's end-cap: when a text search runs out of title matches,
 * offer picks below the results instead of a dead end.
 *
 *   - "taste"   signed in with taste data: the For You seed → candidate →
 *               enrich pipeline (cached ~1h, shared with For You / Swipe),
 *               re-ranked toward the search's genres so picks stay on-topic.
 *   - "popular" guests and users with no taste data yet: popular titles in
 *               the search's genres. Never claims to be personalised.
 *
 * Deliberately lighter than getForYouFeed (which builds every row, ~150
 * TMDB calls): one seed pass + up to ENRICH_LIMIT detail fetches.
 */

export interface EndCapItem {
  id: number;
  mediaType: 'movie' | 'tv';
  title: string;
  year: string | null;
  posterPath: string | null;
  /** "Because you liked X" — taste mode only. */
  reason: string | null;
}

export interface EndCapResult {
  mode: 'taste' | 'popular';
  items: EndCapItem[];
}

export const endCapQuerySchema = z.object({
  /** The search's dominant genre ids (client-derived from its results). */
  genres: z
    .string()
    .optional()
    .transform((s) =>
      (s ?? '')
        .split(',')
        .map((g) => parseInt(g, 10))
        .filter((g) => Number.isInteger(g) && g > 0)
        .slice(0, 3),
    ),
  region: z.string().length(2).optional(),
});

const RESULT_LIMIT = 16; // client shows 12 after removing titles already on screen
const ENRICH_LIMIT = 24;
const GENRE_BOOST = 3; // per overlapping genre, vs. seed-overlap score of ~1-4

export async function getSearchEndCap(
  userId: string | null,
  rawQuery: unknown,
): Promise<EndCapResult> {
  const parsed = endCapQuerySchema.safeParse(rawQuery);
  if (!parsed.success) {
    throw new ValidationAppError('Invalid end-cap query', parsed.error.flatten());
  }
  const { genres } = parsed.data;
  const region = parsed.data.region ?? 'US';

  if (userId) {
    const [seeds, excludeSet] = await Promise.all([pickSeeds(userId), loadExcludeSet(userId)]);
    if (seeds.length > 0) {
      const taste = await tastePicks(seeds, excludeSet, region, genres);
      if (taste.length > 0) return { mode: 'taste', items: taste };
    }
    return { mode: 'popular', items: await popularPicks(region, genres, excludeSet) };
  }
  return { mode: 'popular', items: await popularPicks(region, genres, new Set()) };
}

async function tastePicks(
  seeds: Awaited<ReturnType<typeof pickSeeds>>,
  excludeSet: Set<string>,
  region: string,
  genres: number[],
): Promise<EndCapItem[]> {
  const candidates = (await gatherCandidates(seeds, excludeSet)).slice(0, ENRICH_LIMIT);
  const enriched = await Promise.all(candidates.map((c) => enrichCandidate(c, region)));

  const wanted = new Set(genres);
  return enriched
    .map((e, i) => ({ e, base: candidates[i].score }))
    .filter((x): x is { e: NonNullable<typeof x.e>; base: number } => !!x.e?.ui.posterPath)
    .map(({ e, base }) => {
      // Search-aware: lean toward the genres the user was searching in.
      let overlap = 0;
      for (const g of e.features.genreIds) if (wanted.has(g)) overlap++;
      return { e, score: base + overlap * GENRE_BOOST };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, RESULT_LIMIT)
    .map(({ e }) => ({
      id: e.ui.tmdbId,
      mediaType: e.ui.mediaType,
      title: e.ui.title,
      year: e.ui.year,
      posterPath: e.ui.posterPath,
      reason: e.ui.reason ?? null,
    }));
}

async function popularPicks(
  region: string,
  genres: number[],
  excludeSet: Set<string>,
): Promise<EndCapItem[]> {
  let raw: SearchResult[];
  if (genres.length > 0) {
    // Popular in the search's leading genre (movie + tv, interleaved).
    const [movies, shows] = await Promise.all([
      discover.movie({ region, genre: [genres[0]] }).catch(() => null),
      discover.tv({ region, genre: [genres[0]] }).catch(() => null),
    ]);
    const m = movies?.results ?? [];
    const t = shows?.results ?? [];
    raw = [];
    for (let i = 0; i < Math.max(m.length, t.length); i++) {
      if (m[i]) raw.push(m[i]);
      if (t[i]) raw.push(t[i]);
    }
  } else {
    raw = (await trending.all('week', { region }).catch(() => ({ results: [] }))).results;
  }

  const out: EndCapItem[] = [];
  for (const r of raw) {
    if (r.mediaType !== 'movie' && r.mediaType !== 'tv') continue;
    if (!r.posterPath || excludeSet.has(`${r.mediaType}:${r.id}`)) continue;
    const date = r.mediaType === 'movie' ? r.releaseDate : r.firstAirDate;
    out.push({
      id: r.id,
      mediaType: r.mediaType,
      title: r.mediaType === 'movie' ? r.title : r.name,
      year: date ? String(new Date(date).getFullYear()) : null,
      posterPath: r.posterPath,
      reason: null,
    });
    if (out.length === RESULT_LIMIT) break;
  }
  return out;
}
