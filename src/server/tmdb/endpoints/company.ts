/* eslint-disable @typescript-eslint/no-explicit-any */
import { tmdbFetch } from "../client";
import { TmdbImage } from "../types";
import { mapCompany } from "../mappers";

export const company = {
  details: (id: number) =>
    tmdbFetch<any>(`/company/${id}`).then((item) => ({
      ...mapCompany(item),
      ...item, // keep raw fields like headquarters, homepage, etc.
    })),
  alternativeNames: (id: number) =>
    tmdbFetch<any>(`/company/${id}/alternative_names`),
  images: (id: number) =>
    tmdbFetch<{ id: number; logos: TmdbImage[] }>(`/company/${id}/images`),
};
