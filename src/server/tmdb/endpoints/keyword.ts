/* eslint-disable @typescript-eslint/no-explicit-any */
import { tmdbFetch } from "../client";
import { Paginated, MovieCard } from "../types";
import { mapPaginatedResponse, mapMovie } from "../mappers";

export const keyword = {
  details: (id: number) => tmdbFetch<any>(`/keyword/${id}`),
  movies: (id: number, page = 1) =>
    tmdbFetch<Paginated<MovieCard>>(`/keyword/${id}/movies`, { page }).then(
      (r) =>
        mapPaginatedResponse(r, (item) =>
          mapMovie({ ...item, media_type: "movie" })
        )
    ),
};
