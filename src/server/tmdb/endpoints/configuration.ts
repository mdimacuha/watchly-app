/* eslint-disable @typescript-eslint/no-explicit-any */
import { tmdbFetch } from "../client";

export const configuration = {
  details: () => tmdbFetch<any>("/configuration"),
  countries: () =>
    tmdbFetch<
      { iso_3166_1: string; native_name: string; english_name: string }[]
    >("/configuration/countries"),
  jobs: () =>
    tmdbFetch<{ department: string; jobs: string[] }[]>("/configuration/jobs"),
  languages: () =>
    tmdbFetch<{ iso_639_1: string; english_name: string; name: string }[]>(
      "/configuration/languages"
    ),
  primaryTranslations: () =>
    tmdbFetch<string[]>("/configuration/primary_translations"),
  timezones: () =>
    tmdbFetch<{ iso_3166_1: string; zones: string[] }[]>(
      "/configuration/timezones"
    ),
};
