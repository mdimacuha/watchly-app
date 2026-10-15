/* eslint-disable @typescript-eslint/no-explicit-any */
import { tmdbFetch, PROVIDERS_REVALIDATE } from "../client";
import { TvCard, Paginated, TmdbImage, TmdbVideo, TvDetails } from "../types";
import { mapPaginatedResponse, mapTv, mapTvDetails } from "../mappers";

export const tv = {
  airingToday: ({ page = 1, region }: { page?: number; region?: string } = {}) =>
    tmdbFetch<Paginated<TvCard>>(
      "/tv/airing_today",
      { page },
      { region }
    ).then((r) =>
      mapPaginatedResponse(r, (item) => mapTv({ ...item, media_type: "tv" }))
    ),
  onTheAir: ({ page = 1, region }: { page?: number; region?: string } = {}) =>
    tmdbFetch<Paginated<TvCard>>(
      "/tv/on_the_air",
      { page },
      { region }
    ).then((r) =>
      mapPaginatedResponse(r, (item) => mapTv({ ...item, media_type: "tv" }))
    ),
  popular: ({ page = 1, region }: { page?: number; region?: string } = {}) =>
    tmdbFetch<Paginated<TvCard>>(
      "/tv/popular",
      { page },
      { region }
    ).then((r) =>
      mapPaginatedResponse(r, (item) => mapTv({ ...item, media_type: "tv" }))
    ),
  topRated: ({ page = 1, region }: { page?: number; region?: string } = {}) =>
    tmdbFetch<Paginated<TvCard>>(
      "/tv/top_rated",
      { page },
      { region }
    ).then((r) =>
      mapPaginatedResponse(r, (item) => mapTv({ ...item, media_type: "tv" }))
    ),
  details: (id: number): Promise<TvDetails> => tmdbFetch<any>(`/tv/${id}`).then(mapTvDetails),
  aggregateCredits: (id: number) => tmdbFetch<any>(`/tv/${id}/aggregate_credits`),
  contentRatings: (id: number) => tmdbFetch<any>(`/tv/${id}/content_ratings`),
  credits: (id: number) => tmdbFetch<any>(`/tv/${id}/credits`),
  images: (id: number) =>
    tmdbFetch<{ backdrops: TmdbImage[]; posters: TmdbImage[] }>(
      `/tv/${id}/images`
    ),
  keywords: (id: number) =>
    tmdbFetch<{ id: number; results: { id: number; name: string }[] }>(
      `/tv/${id}/keywords`
    ),
  recommendations: (id: number, page = 1) =>
    tmdbFetch<Paginated<TvCard>>(`/tv/${id}/recommendations`, { page }).then(
      (r) =>
        mapPaginatedResponse(r, (item) => mapTv({ ...item, media_type: "tv" }))
    ),
  reviews: (id: number, page = 1) =>
    tmdbFetch<Paginated<any>>(`/tv/${id}/reviews`, { page }),
  similar: (id: number, page = 1) =>
    tmdbFetch<Paginated<TvCard>>(`/tv/${id}/similar`, { page }).then((r) =>
      mapPaginatedResponse(r, (item) => mapTv({ ...item, media_type: "tv" }))
    ),
  translations: (id: number) => tmdbFetch<any>(`/tv/${id}/translations`),
  videos: (id: number) =>
    tmdbFetch<{ id: number; results: TmdbVideo[] }>(`/tv/${id}/videos`),
  // Availability changes on licensing boundaries, not on the catalog's schedule:
  // pinned to 6h rather than riding the 24h catalog default.
  watchProviders: (id: number) =>
    tmdbFetch<any>(`/tv/${id}/watch/providers`, undefined, {
      cache: { revalidate: PROVIDERS_REVALIDATE },
    }),
};
