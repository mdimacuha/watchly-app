/* eslint-disable @typescript-eslint/no-explicit-any */
import { tmdbFetch } from "../client";
import { PersonDetails, TmdbImage } from "../types";
import { mapPersonDetails } from "../mappers";

export const person = {
  details: (id: number): Promise<PersonDetails> => tmdbFetch<any>(`/person/${id}`).then(mapPersonDetails),
  movieCredits: (id: number) => tmdbFetch<any>(`/person/${id}/movie_credits`),
  tvCredits: (id: number) => tmdbFetch<any>(`/person/${id}/tv_credits`),
  combinedCredits: (id: number) => tmdbFetch<any>(`/person/${id}/combined_credits`),
  images: (id: number) =>
    tmdbFetch<{ id: number; profiles: TmdbImage[] }>(`/person/${id}/images`),
};
