/* eslint-disable @typescript-eslint/no-explicit-any */
import { tmdbFetch } from "../client";
import { TmdbImage } from "../types";

export const network = {
  details: (id: number) => tmdbFetch<any>(`/network/${id}`),
  alternativeNames: (id: number) =>
    tmdbFetch<any>(`/network/${id}/alternative_names`),
  images: (id: number) =>
    tmdbFetch<{ id: number; logos: TmdbImage[] }>(`/network/${id}/images`),
};
