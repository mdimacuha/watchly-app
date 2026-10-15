import { tmdbFetch } from "../client";

export interface Provider {
  display_priority: number;
  logo_path: string;
  provider_name: string;
  provider_id: number;
}

export const providers = {
  regions: () =>
    tmdbFetch<
      {
        iso_3166_1: string;
        native_name: string;
        english_name: string;
      }[]
    >("/watch/providers/regions"),
  movieProviders: (region?: string) =>
    tmdbFetch<{ results: Provider[] }>("/watch/providers/movie", {
      watch_region: region,
    }),
  tvProviders: (region?: string) =>
    tmdbFetch<{ results: Provider[] }>("/watch/providers/tv", {
      watch_region: region,
    }),
};
