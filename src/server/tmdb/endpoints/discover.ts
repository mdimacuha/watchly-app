import { tmdbFetch } from "../client";
import { MovieCard, TvCard, Paginated } from "../types";
import { mapPaginatedResponse, mapMovie, mapTv } from "../mappers";

interface DiscoverFilters {
  page?: number;
  region?: string;
  year?: number;
  genre?: number[];
  providers?: number[];
  sortBy?: string;
}

export const discover = {
  movie: ({ page = 1, region, year, genre, providers, sortBy = "popularity.desc" }: DiscoverFilters) => {
    const params: Record<string, string | number | boolean> = {
      page,
      sort_by: sortBy,
      include_adult: false,
      include_video: false,
    };

    if (region) {
      params.region = region;
      params.watch_region = region;
    }
    
    if (year) params.primary_release_year = year;
    if (genre && genre.length > 0) params.with_genres = genre.join(",");
    
    if (providers && providers.length > 0) {
      params.with_watch_providers = providers.join("|");
      params.with_watch_monetization_types = "flatrate|free|ads|rent|buy";
    }

    return tmdbFetch<Paginated<MovieCard>>("/discover/movie", params).then((r) =>
      mapPaginatedResponse(r, (item) => mapMovie({ ...item, media_type: "movie" }))
    );
  },
  tv: ({ page = 1, region, year, genre, providers, sortBy = "popularity.desc" }: DiscoverFilters) => {
    const params: Record<string, string | number | boolean> = {
      page,
      sort_by: sortBy,
      include_adult: false,
      include_null_first_air_dates: false,
    };

    if (region) {
      params.region = region;
      params.watch_region = region;
    }
    
    if (year) params.first_air_date_year = year;
    if (genre && genre.length > 0) params.with_genres = genre.join(",");

    if (providers && providers.length > 0) {
      params.with_watch_providers = providers.join("|");
      params.with_watch_monetization_types = "flatrate|free|ads|rent|buy";
    }

    return tmdbFetch<Paginated<TvCard>>("/discover/tv", params).then((r) =>
      mapPaginatedResponse(r, (item) => mapTv({ ...item, media_type: "tv" }))
    );
  },
};
