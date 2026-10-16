/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  MovieCard,
  TvCard,
  PersonCard,
  CollectionCard,
  CompanyCard,
  SearchResult,
  Paginated,
  MovieDetails,
  TvDetails,
  PersonDetails,
} from "./types";

export function mapMovie(result: any): MovieCard {
  return {
    id: result.id,
    title: result.title,
    posterPath: result.poster_path,
    backdropPath: result.backdrop_path,
    releaseDate: result.release_date,
    voteAverage: result.vote_average,
    overview: result.overview,
    genreIds: result.genre_ids,
    voteCount: result.vote_count,
    mediaType: "movie",
  };
}

export function mapTv(result: any): TvCard {
  return {
    id: result.id,
    name: result.name,
    posterPath: result.poster_path,
    backdropPath: result.backdrop_path,
    firstAirDate: result.first_air_date,
    voteAverage: result.vote_average,
    overview: result.overview,
    genreIds: result.genre_ids,
    voteCount: result.vote_count,
    mediaType: "tv",
  };
}

export function mapPerson(result: any): PersonCard {
  return {
    id: result.id,
    name: result.name,
    profilePath: result.profile_path,
    knownForDepartment: result.known_for_department,
    knownFor: Array.isArray(result.known_for)
      ? result.known_for
          .filter((k: any) => k.media_type === "movie" || k.media_type === "tv")
          .map((k: any) => ({
            id: k.id,
            mediaType: k.media_type,
            title: k.title ?? k.name ?? "",
          }))
      : undefined,
    popularity: result.popularity,
    mediaType: "person",
  };
}

export function mapCollection(result: any): CollectionCard {
  return {
    id: result.id,
    name: result.name,
    posterPath: result.poster_path,
    backdropPath: result.backdrop_path,
    mediaType: "collection",
  };
}

export function mapCompany(result: any): CompanyCard {
  return {
    id: result.id,
    name: result.name,
    logoPath: result.logo_path,
    mediaType: "company",
  };
}

export function mapSearchResult(result: any): SearchResult | null {
  switch (result.media_type) {
    case "movie":
      return mapMovie(result);
    case "tv":
      return mapTv(result);
    case "person":
      return mapPerson(result);
    // Multi-search can return known_for for people, but main object is person.
    // It does not return collection or company usually unless specified in some specific search type.
    default:
      // If we are searching for collection or company explicitly, the caller knows the type.
      // But for multi-search, we only support movie, tv, person.
      return null;
  }
}

export function mapPaginatedResponse<T>(
  response: any,
  mapper: (item: any) => T | null
): Paginated<T> {
  return {
    page: response.page,
    results: response.results.map(mapper).filter((item: T | null): item is T => item !== null),
    total_pages: response.total_pages,
    total_results: response.total_results,
  };
}

export function mapMovieDetails(result: any): MovieDetails {
  return {
    ...mapMovie(result),
    genres: result.genres,
    homepage: result.homepage,
    imdb_id: result.imdb_id,
    original_language: result.original_language,
    original_title: result.original_title,
    popularity: result.popularity,
    production_companies: result.production_companies,
    production_countries: result.production_countries,
    revenue: result.revenue,
    runtime: result.runtime,
    spoken_languages: result.spoken_languages,
    status: result.status,
    tagline: result.tagline,
    video: result.video,
    vote_count: result.vote_count,
    mediaType: "movie",
  };
}

export function mapTvDetails(result: any): TvDetails {
  return {
    ...mapTv(result),
    created_by: result.created_by,
    episode_run_time: result.episode_run_time,
    genres: result.genres,
    homepage: result.homepage,
    in_production: result.in_production,
    languages: result.languages,
    last_air_date: result.last_air_date,
    last_episode_to_air: result.last_episode_to_air,
    next_episode_to_air: result.next_episode_to_air,
    networks: result.networks,
    number_of_episodes: result.number_of_episodes,
    number_of_seasons: result.number_of_seasons,
    origin_country: result.origin_country,
    original_language: result.original_language,
    original_name: result.original_name,
    popularity: result.popularity,
    production_companies: result.production_companies,
    production_countries: result.production_countries,
    seasons: result.seasons,
    spoken_languages: result.spoken_languages,
    status: result.status,
    tagline: result.tagline,
    type: result.type,
    vote_count: result.vote_count,
    mediaType: "tv",
  };
}

export function mapPersonDetails(result: any): PersonDetails {
  return {
    ...mapPerson(result),
    also_known_as: result.also_known_as,
    biography: result.biography,
    birthday: result.birthday,
    deathday: result.deathday,
    gender: result.gender,
    homepage: result.homepage,
    imdb_id: result.imdb_id,
    place_of_birth: result.place_of_birth,
    popularity: result.popularity,
    mediaType: "person",
  };
}
