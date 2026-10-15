/* eslint-disable @typescript-eslint/no-explicit-any */
import { tmdbFetch } from "../client";
import { TmdbImage, Paginated, CollectionCard } from "../types";
import { mapCollection, mapPaginatedResponse } from "../mappers";

export const collection = {
  details: (id: number) =>
    tmdbFetch<any>(`/collection/${id}`).then((item) => ({
      ...mapCollection(item),
      parts: item.parts.map((part: any) => ({
        id: part.id,
        title: part.title,
        posterPath: part.poster_path,
        backdropPath: part.backdrop_path,
        releaseDate: part.release_date,
        overview: part.overview,
        voteAverage: part.vote_average,
        mediaType: "movie",
      })),
      overview: item.overview,
    })),
  images: (id: number) =>
    tmdbFetch<{ id: number; posters: TmdbImage[]; backdrops: TmdbImage[] }>(
      `/collection/${id}/images`
    ),
  search: (query: string, page = 1) =>
    tmdbFetch<Paginated<any>>("/search/collection", { query, page }).then(
      (r) => mapPaginatedResponse(r, mapCollection)
    ),
  trending: (page = 1) =>
    // Fallback to searching "Collection" as trending collections endpoint doesn't exist
    tmdbFetch<Paginated<any>>("/search/collection", {
      query: "Collection",
      page,
    }).then((r) => mapPaginatedResponse(r, mapCollection)),
};
