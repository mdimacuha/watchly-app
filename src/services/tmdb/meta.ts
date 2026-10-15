import 'server-only';
import { movie, tv, person, tmdbFetch, TmdbError } from '@/server/tmdb';

/**
 * Lightweight, region-independent metadata fetchers for `generateMetadata` and
 * the OG-image routes.
 *
 * These deliberately hit the single `/{mediaType}/{id}` detail endpoint rather
 * than the page's heavy `getTitlePagePayload` (which fans out to providers,
 * credits, recommendations, release dates, …). Because `tmdbFetch` caches by
 * URL in the Next Data Cache (1h revalidate), the detail call here is shared
 * cross-request with the page render and — critically — with the separate
 * request a social crawler makes to the OG-image route. No duplicate upstream
 * TMDB traffic for metadata or share cards.
 *
 * Every fetcher returns `null` on a 404 so callers can emit fallback metadata
 * and `robots: { index: false }` instead of throwing.
 */

export type TitleMeta = {
  mediaType: 'movie' | 'tv';
  id: string;
  name: string;
  year: string | null;
  overview: string;
  posterPath: string | null;
  backdropPath: string | null;
  genres: string[];
  voteAverage: number;
  voteCount: number;
  runtimeMinutes: number | null;
  /** ISO date the title first released / aired, if known. */
  datePublished: string | null;
  numberOfSeasons: number | null;
};

function isNotFound(e: unknown): boolean {
  return e instanceof TmdbError && e.status === 404;
}

export async function getTitleMeta(input: {
  mediaType: 'movie' | 'tv';
  id: string;
}): Promise<TitleMeta | null> {
  const numericId = Number(input.id);
  if (!Number.isFinite(numericId) || numericId <= 0) return null;

  try {
    if (input.mediaType === 'movie') {
      const d = await movie.details(numericId);
      return {
        mediaType: 'movie',
        id: input.id,
        name: d.title,
        year: d.releaseDate ? d.releaseDate.slice(0, 4) : null,
        overview: d.overview ?? '',
        posterPath: d.posterPath,
        backdropPath: d.backdropPath,
        genres: d.genres?.map((g) => g.name) ?? [],
        voteAverage: d.voteAverage ?? 0,
        voteCount: d.vote_count ?? 0,
        runtimeMinutes: d.runtime ?? null,
        datePublished: d.releaseDate ?? null,
        numberOfSeasons: null,
      };
    }
    const d = await tv.details(numericId);
    return {
      mediaType: 'tv',
      id: input.id,
      name: d.name,
      year: d.firstAirDate ? d.firstAirDate.slice(0, 4) : null,
      overview: d.overview ?? '',
      posterPath: d.posterPath,
      backdropPath: d.backdropPath,
      genres: d.genres?.map((g) => g.name) ?? [],
      voteAverage: d.voteAverage ?? 0,
      voteCount: d.vote_count ?? 0,
      runtimeMinutes: d.episode_run_time?.[0] ?? null,
      datePublished: d.firstAirDate ?? null,
      numberOfSeasons: d.number_of_seasons ?? null,
    };
  } catch (e) {
    if (isNotFound(e)) return null;
    throw e;
  }
}

export type CollectionMeta = {
  id: string;
  name: string;
  overview: string;
  posterPath: string | null;
  backdropPath: string | null;
  partCount: number;
};

export async function getCollectionMeta(id: string): Promise<CollectionMeta | null> {
  const numericId = Number(id);
  if (!Number.isFinite(numericId) || numericId <= 0) return null;

  try {
    const d = await tmdbFetch<{
      id: number;
      name: string;
      overview: string | null;
      poster_path: string | null;
      backdrop_path: string | null;
      parts?: unknown[];
    }>(`/collection/${numericId}`);
    return {
      id,
      name: d.name,
      overview: d.overview ?? '',
      posterPath: d.poster_path,
      backdropPath: d.backdrop_path,
      partCount: d.parts?.length ?? 0,
    };
  } catch (e) {
    if (isNotFound(e)) return null;
    throw e;
  }
}

export type PersonMeta = {
  id: string;
  name: string;
  biography: string;
  profilePath: string | null;
  knownForDepartment: string;
};

export async function getPersonMeta(id: string): Promise<PersonMeta | null> {
  const numericId = Number(id);
  if (!Number.isFinite(numericId) || numericId <= 0) return null;

  try {
    const d = await person.details(numericId);
    return {
      id,
      name: d.name,
      biography: d.biography ?? '',
      profilePath: d.profilePath,
      knownForDepartment: d.knownForDepartment ?? '',
    };
  } catch (e) {
    if (isNotFound(e)) return null;
    throw e;
  }
}
