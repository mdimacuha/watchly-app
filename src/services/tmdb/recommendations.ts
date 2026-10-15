import { movie, tv } from '@/server/tmdb';
import type { MovieCard, TvCard } from '@/server/tmdb/types';
import { mapWithConcurrency } from '@/lib/concurrency';

/**
 * A lightweight, poster-ready recommendation. Deliberately smaller than
 * `SearchResponseItem` — the "Similar" tab in the add-titles modal only needs
 * enough to render a poster card and fire an add, so we skip the per-item
 * provider fan-out that the search service does.
 */
export interface RecommendationItem {
  id: number;
  mediaType: 'movie' | 'tv';
  title: string;
  year: string | null;
  posterPath: string | null;
}

export interface RecommendationSeed {
  mediaType: 'movie' | 'tv';
  mediaId: string;
}

// Cap how many existing items we fan out over — recommendations from the most
// recent handful are a good enough signal, and this keeps the TMDB call count
// bounded for large lists.
const MAX_SEEDS = 8;
// Cap the returned set so the modal grid stays snappy.
const MAX_RESULTS = 24;

function toRecommendationItem(
  raw: MovieCard | TvCard,
): RecommendationItem | null {
  if (raw.mediaType === 'movie') {
    return {
      id: raw.id,
      mediaType: 'movie',
      title: raw.title,
      year: raw.releaseDate
        ? new Date(raw.releaseDate).getFullYear().toString()
        : null,
      posterPath: raw.posterPath,
    };
  }
  if (raw.mediaType === 'tv') {
    return {
      id: raw.id,
      mediaType: 'tv',
      title: raw.name,
      year: raw.firstAirDate
        ? new Date(raw.firstAirDate).getFullYear().toString()
        : null,
      posterPath: raw.posterPath,
    };
  }
  return null;
}

/**
 * Build a de-duplicated "you might also like" set for a watchlist by pulling
 * TMDB recommendations for each seed item and aggregating them.
 *
 * Ranking: titles recommended by more than one seed float to the top (a
 * simple frequency score), so the results skew toward the list's overall
 * taste rather than any single title. Seeds themselves and anything already on
 * the list (`excludeKeys`, formatted `${mediaType}:${mediaId}`) are dropped so
 * the tab never suggests a duplicate add.
 */
export async function getWatchlistRecommendations(
  seeds: RecommendationSeed[],
  excludeKeys: Set<string> = new Set(),
): Promise<RecommendationItem[]> {
  if (seeds.length === 0) return [];

  // Seeds arrive top-first (newest sortOrder) from the caller; take the head.
  const limitedSeeds = seeds.slice(0, MAX_SEEDS);
  const seedKeys = new Set(
    limitedSeeds.map((s) => `${s.mediaType}:${s.mediaId}`),
  );

  const perSeedResults = await mapWithConcurrency(
    limitedSeeds,
    5,
    async (seed): Promise<(MovieCard | TvCard)[]> => {
      const id = Number(seed.mediaId);
      if (!Number.isFinite(id)) return [];
      try {
        const data =
          seed.mediaType === 'movie'
            ? await movie.recommendations(id)
            : await tv.recommendations(id);
        return data.results;
      } catch {
        // A single seed failing (deleted title, TMDB hiccup) shouldn't sink
        // the whole tab — just contribute nothing.
        return [];
      }
    },
  );

  const scored = new Map<string, { item: RecommendationItem; score: number }>();
  for (const results of perSeedResults) {
    for (const raw of results) {
      const item = toRecommendationItem(raw);
      if (!item) continue;
      const key = `${item.mediaType}:${item.id}`;
      if (seedKeys.has(key) || excludeKeys.has(key)) continue;
      const existing = scored.get(key);
      if (existing) existing.score += 1;
      else scored.set(key, { item, score: 1 });
    }
  }

  return [...scored.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_RESULTS)
    .map((s) => s.item);
}
