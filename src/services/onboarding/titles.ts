import { movie, tv, search } from '@/server/tmdb';
import type { MovieCard, TvCard } from '@/server/tmdb';
import { buildImageUrl } from '@/lib/tmdb';

export type OnboardingTitle = {
  mediaType: 'movie' | 'tv';
  mediaId: string;
  title: string;
  posterUrl: string | null;
  releaseYear: string | null;
};

/**
 * Pulls a small, interleaved set of popular movies + popular TV for the
 * onboarding picker. Two pages each → ~40 movies + ~40 TV, deduped to a
 * 30-item poster grid. We intentionally keep this small: onboarding is a
 * 5-minute step and a too-long list dilutes the seed signal we capture.
 */
export async function getOnboardingPicks(
  region: string | null,
): Promise<OnboardingTitle[]> {
  const [m1, m2, t1, t2] = await Promise.all([
    movie.popular({ page: 1, region: region ?? undefined }),
    movie.popular({ page: 2, region: region ?? undefined }),
    tv.popular({ page: 1, region: region ?? undefined }),
    tv.popular({ page: 2, region: region ?? undefined }),
  ]);

  const movies: OnboardingTitle[] = [...m1.results, ...m2.results]
    .filter((r) => Boolean(r.posterPath))
    .map((r) => ({
      mediaType: 'movie' as const,
      mediaId: String(r.id),
      title: r.title,
      posterUrl: buildImageUrl(r.posterPath, 'w342'),
      releaseYear: r.releaseDate ? r.releaseDate.slice(0, 4) : null,
    }));

  const shows: OnboardingTitle[] = [...t1.results, ...t2.results]
    .filter((r) => Boolean(r.posterPath))
    .map((r) => ({
      mediaType: 'tv' as const,
      mediaId: String(r.id),
      title: r.name,
      posterUrl: buildImageUrl(r.posterPath, 'w342'),
      releaseYear: r.firstAirDate ? r.firstAirDate.slice(0, 4) : null,
    }));

  // Interleave so the grid alternates movie/tv visually — keeps the
  // section from feeling like two separate lists stacked.
  const out: OnboardingTitle[] = [];
  const max = Math.max(movies.length, shows.length);
  for (let i = 0; i < max && out.length < 30; i++) {
    if (movies[i]) out.push(movies[i]);
    if (shows[i] && out.length < 30) out.push(shows[i]);
  }
  return out;
}

/**
 * TMDB-backed search for the onboarding picker. Hits `/search/movie` +
 * `/search/tv` in parallel, normalises each into the shared
 * `OnboardingTitle` shape, then interleaves so movies and shows
 * alternate visually. Returns up to 30 hits — same ceiling as the
 * popular grid, so the UI doesn't shift size when the query clears.
 *
 * Errors are swallowed per side (a TMDB hiccup on the movie endpoint
 * still lets TV results through), and an empty query short-circuits
 * to an empty array — the caller is expected to fall back to
 * `getOnboardingPicks` when there's nothing to search.
 */
export async function searchOnboardingTitles(
  query: string,
  region: string | null,
): Promise<OnboardingTitle[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const [movieResults, tvResults] = await Promise.all([
    search(trimmed, { type: 'movie', region: region ?? undefined }).catch(
      () => ({ results: [] }),
    ),
    search(trimmed, { type: 'tv', region: region ?? undefined }).catch(
      () => ({ results: [] }),
    ),
  ]);

  // `search()` returns a SearchResult union (MovieCard | TvCard | …).
  // We requested type='movie'/'tv' so the runtime shape is known, but
  // TS can't carry the narrowing through `.filter` chains. Cast the
  // arrays once via the named card types and map.
  const movies: OnboardingTitle[] = (movieResults.results as MovieCard[])
    .filter((r) => Boolean(r.posterPath))
    .map((r) => ({
      mediaType: 'movie' as const,
      mediaId: String(r.id),
      title: r.title,
      posterUrl: buildImageUrl(r.posterPath, 'w342'),
      releaseYear: r.releaseDate ? r.releaseDate.slice(0, 4) : null,
    }));

  const shows: OnboardingTitle[] = (tvResults.results as TvCard[])
    .filter((r) => Boolean(r.posterPath))
    .map((r) => ({
      mediaType: 'tv' as const,
      mediaId: String(r.id),
      title: r.name,
      posterUrl: buildImageUrl(r.posterPath, 'w342'),
      releaseYear: r.firstAirDate ? r.firstAirDate.slice(0, 4) : null,
    }));

  const out: OnboardingTitle[] = [];
  const max = Math.max(movies.length, shows.length);
  for (let i = 0; i < max && out.length < 30; i++) {
    if (movies[i]) out.push(movies[i]);
    if (shows[i] && out.length < 30) out.push(shows[i]);
  }
  return out;
}
