/* eslint-disable @typescript-eslint/no-explicit-any */
import { tmdbFetch, PROVIDERS_REVALIDATE } from "../client";
import { MovieCard, Paginated, TmdbImage, TmdbVideo, MovieDetails } from "../types";
import { mapPaginatedResponse, mapMovie, mapMovieDetails } from "../mappers";

export const movie = {
  nowPlaying: ({ page = 1, region }: { page?: number; region?: string } = {}) =>
    tmdbFetch<Paginated<MovieCard>>(
      "/movie/now_playing",
      { page },
      { region }
    ).then((r) =>
      mapPaginatedResponse(r, (item) =>
        mapMovie({ ...item, media_type: "movie" })
      )
    ),
  popular: ({ page = 1, region }: { page?: number; region?: string } = {}) =>
    tmdbFetch<Paginated<MovieCard>>(
      "/movie/popular",
      { page },
      { region }
    ).then((r) =>
      mapPaginatedResponse(r, (item) =>
        mapMovie({ ...item, media_type: "movie" })
      )
    ),
  topRated: ({ page = 1, region }: { page?: number; region?: string } = {}) =>
    tmdbFetch<Paginated<MovieCard>>(
      "/movie/top_rated",
      { page },
      { region }
    ).then((r) =>
      mapPaginatedResponse(r, (item) =>
        mapMovie({ ...item, media_type: "movie" })
      )
    ),
  upcoming: ({ page = 1, region }: { page?: number; region?: string } = {}) =>
    tmdbFetch<Paginated<MovieCard>>(
      "/movie/upcoming",
      { page },
      { region }
    ).then((r) =>
      mapPaginatedResponse(r, (item) =>
        mapMovie({ ...item, media_type: "movie" })
      )
    ),
  details: (id: number): Promise<MovieDetails> => tmdbFetch<any>(`/movie/${id}`).then(mapMovieDetails),
  credits: (id: number) => tmdbFetch<any>(`/movie/${id}/credits`),
  images: (id: number) =>
    tmdbFetch<{ backdrops: TmdbImage[]; posters: TmdbImage[] }>(
      `/movie/${id}/images`
    ),
  keywords: (id: number) =>
    tmdbFetch<{ id: number; keywords: { id: number; name: string }[] }>(
      `/movie/${id}/keywords`
    ),
  recommendations: (id: number, page = 1) =>
    tmdbFetch<Paginated<MovieCard>>(`/movie/${id}/recommendations`, {
      page,
    }).then((r) =>
      mapPaginatedResponse(r, (item) => mapMovie({ ...item, media_type: "movie" }))
    ),
  reviews: (id: number, page = 1) =>
    tmdbFetch<Paginated<any>>(`/movie/${id}/reviews`, { page }),
  similar: (id: number, page = 1) =>
    tmdbFetch<Paginated<MovieCard>>(`/movie/${id}/similar`, { page }).then((r) =>
      mapPaginatedResponse(r, (item) => mapMovie({ ...item, media_type: "movie" }))
    ),
  translations: (id: number) => tmdbFetch<any>(`/movie/${id}/translations`),
  videos: (id: number) =>
    tmdbFetch<{ id: number; results: TmdbVideo[] }>(`/movie/${id}/videos`),
  // Availability changes on licensing boundaries, not on the catalog's schedule:
  // pinned to 6h rather than riding the 24h catalog default.
  watchProviders: (id: number) =>
    tmdbFetch<any>(`/movie/${id}/watch/providers`, undefined, {
      cache: { revalidate: PROVIDERS_REVALIDATE },
    }),
  releaseDates: (id: number) => tmdbFetch<any>(`/movie/${id}/release_dates`),
};
