import { tmdbFetch } from "../client";

export const genre = {
  movieList: () =>
    tmdbFetch<{ genres: { id: number; name: string }[] }>("/genre/movie/list"),
  tvList: () =>
    tmdbFetch<{ genres: { id: number; name: string }[] }>("/genre/tv/list"),
};
