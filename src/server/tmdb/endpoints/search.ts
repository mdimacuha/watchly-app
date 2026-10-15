/* eslint-disable @typescript-eslint/no-explicit-any */
import { tmdbFetch } from "../client";
import { SearchResult, Paginated } from "../types";
import {
  mapSearchResult,
  mapPaginatedResponse,
  mapMovie,
  mapTv,
  mapPerson,
  mapCollection,
  mapCompany,
} from "../mappers";

export async function search(
  query: string,
  input: {
    type?: "multi" | "movie" | "tv" | "person" | "collection" | "company" | "keyword";
    page?: number;
    year?: number;
    cast?: number[];
    director?: number[];
    collection?: number;
    keywords?: number[];
    genre?: number[];
    region?: string;
    sort?: string;
  } = {}
): Promise<Paginated<SearchResult>> {
  const {
    type = "multi",
    page = 1,
    year,
    cast,
    director,
    keywords,
    genre,
    region,
    sort,
  } = input;

  // If using discover filters (and type is movie/tv)
  // We use discover if we have specific filters that search doesn't support, OR if sort is specified.
  // Note: 'query' is ignored in discover mode, which matches the prompt implication that filters -> discover.
  const isDiscover =
    (type === "movie" || type === "tv") &&
    (cast || director || keywords || genre || sort || !query);

  if (isDiscover) {
    const params: Record<string, any> = {
      page,
      sort_by: sort,
      with_cast: cast?.join(","),
      with_crew: director?.join(","),
      with_keywords: keywords?.join(","),
      with_genres: genre?.join(","),
      region: region,
      year: year,
    };

    if (type === "movie") {
      params.primary_release_year = year;
    } else if (type === "tv") {
      params.first_air_date_year = year;
    }

    const endpoint = `/discover/${type}`;
    const response = await tmdbFetch<any>(endpoint, params);

    return mapPaginatedResponse(response, (item) => {
      if (type === "movie") return mapMovie({ ...item, media_type: "movie" });
      if (type === "tv") return mapTv({ ...item, media_type: "tv" });
      return item;
    });
  }

  // SEARCH API
  const endpoint = `/search/${type}`;
  const params: Record<string, any> = {
    query,
    page,
    region,
    include_adult: false,
  };

  if (year) {
    if (type === "movie") params.primary_release_year = year;
    if (type === "tv") params.first_air_date_year = year;
  }

  const response = await tmdbFetch<any>(endpoint, params);

  return mapPaginatedResponse(response, (item) => {
    // For specific search types, we know the type, but TMDB might not return media_type in the object.
    // We force it for consistency.
    if (type === "movie") return mapMovie({ ...item, media_type: "movie" });
    if (type === "tv") return mapTv({ ...item, media_type: "tv" });
    if (type === "person") return mapPerson({ ...item, media_type: "person" });
    if (type === "collection")
      return mapCollection({ ...item, media_type: "collection" });
    if (type === "company") return mapCompany({ ...item, media_type: "company" });
    
    // For multi search, media_type is present.
    if (type === "multi") return mapSearchResult(item);
    
    return item;
  });
}
