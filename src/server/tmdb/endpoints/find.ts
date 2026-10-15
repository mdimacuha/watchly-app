/* eslint-disable @typescript-eslint/no-explicit-any */
import { tmdbFetch } from "../client";
import { SearchResult } from "../types";
import { mapMovie, mapTv, mapPerson } from "../mappers";

export const find = (
  externalId: string,
  source:
    | "imdb_id"
    | "tvdb_id"
    | "facebook_id"
    | "instagram_id"
    | "twitter_id"
) =>
  tmdbFetch<any>(`/find/${externalId}`, { external_source: source }).then(
    (r) => {
      const results: SearchResult[] = [];
      if (r.movie_results) {
        results.push(
          ...r.movie_results.map((item: any) =>
            mapMovie({ ...item, media_type: "movie" })
          )
        );
      }
      if (r.tv_results) {
        results.push(
          ...r.tv_results.map((item: any) =>
            mapTv({ ...item, media_type: "tv" })
          )
        );
      }
      if (r.person_results) {
        results.push(
          ...r.person_results.map((item: any) =>
            mapPerson({ ...item, media_type: "person" })
          )
        );
      }
      return results;
    }
  );
