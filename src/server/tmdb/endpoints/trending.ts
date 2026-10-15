/* eslint-disable @typescript-eslint/no-explicit-any */
import { tmdbFetch } from "../client";
import { SearchResult, Paginated } from "../types";
import {
  mapPaginatedResponse,
  mapSearchResult,
  mapMovie,
  mapTv,
  mapPerson,
} from "../mappers";

export type TimeWindow = "day" | "week";

export const trending = {
  all: (timeWindow: TimeWindow = "day", { page = 1, region }: { page?: number; region?: string } = {}) =>
    tmdbFetch<Paginated<any>>(
      `/trending/all/${timeWindow}`,
      { page },
      { region }
    ).then((r) => mapPaginatedResponse(r, mapSearchResult)),
  movie: (
    timeWindow: TimeWindow = "day",
    { page = 1, region }: { page?: number; region?: string } = {}
  ) =>
    tmdbFetch<Paginated<any>>(
      `/trending/movie/${timeWindow}`,
      { page },
      { region }
    ).then((r) =>
      mapPaginatedResponse(r, (item) =>
        mapMovie({ ...item, media_type: "movie" })
      )
    ),
  tv: (
    timeWindow: TimeWindow = "day",
    { page = 1, region }: { page?: number; region?: string } = {}
  ) =>
    tmdbFetch<Paginated<any>>(
      `/trending/tv/${timeWindow}`,
      { page },
      { region }
    ).then((r) =>
      mapPaginatedResponse(r, (item) => mapTv({ ...item, media_type: "tv" }))
    ),
  person: (
    timeWindow: TimeWindow = "day",
    { page = 1, region }: { page?: number; region?: string } = {}
  ) =>
    tmdbFetch<Paginated<any>>(
      `/trending/person/${timeWindow}`,
      { page },
      { region }
    ).then((r) =>
      mapPaginatedResponse(r, (item) =>
        mapPerson({ ...item, media_type: "person" })
      )
    ),
};
