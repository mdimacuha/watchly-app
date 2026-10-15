export type MediaType = "movie" | "tv" | "person";

export interface MovieCard {
  id: number;
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
  releaseDate: string | null;
  voteAverage: number;
  overview: string;
  mediaType: "movie";
}

export interface TvCard {
  id: number;
  name: string;
  posterPath: string | null;
  backdropPath: string | null;
  firstAirDate: string | null;
  voteAverage: number;
  overview: string;
  mediaType: "tv";
}

export interface PersonCard {
  id: number;
  name: string;
  profilePath: string | null;
  knownForDepartment: string;
  mediaType: "person";
}

export interface CollectionCard {
  id: number;
  name: string;
  posterPath: string | null;
  backdropPath: string | null;
  mediaType: "collection";
}

export interface CompanyCard {
  id: number;
  name: string;
  logoPath: string | null;
  mediaType: "company";
}

export type SearchResult = MovieCard | TvCard | PersonCard | CollectionCard | CompanyCard;

export interface Paginated<T> {
  page: number;
  results: T[];
  total_pages: number;
  total_results: number;
}

export interface TmdbImage {
  aspect_ratio: number;
  file_path: string;
  height: number;
  iso_639_1: string | null;
  vote_average: number;
  vote_count: number;
  width: number;
}

export interface TmdbVideo {
  id: string;
  iso_639_1: string;
  iso_3166_1: string;
  name: string;
  key: string;
  site: string;
  size: number;
  type: string;
  official: boolean;
  published_at: string;
}

export interface Genre {
  id: number;
  name: string;
}

export interface ProductionCompany {
  id: number;
  logo_path: string | null;
  name: string;
  origin_country: string;
}

export interface ProductionCountry {
  iso_3166_1: string;
  name: string;
}

export interface SpokenLanguage {
  english_name: string;
  iso_639_1: string;
  name: string;
}

export interface MovieDetails extends Omit<MovieCard, "mediaType"> {
  mediaType: "movie";
  genres: Genre[];
  homepage: string | null;
  imdb_id: string | null;
  original_language: string;
  original_title: string;
  popularity: number;
  production_companies: ProductionCompany[];
  production_countries: ProductionCountry[];
  revenue: number;
  runtime: number | null;
  spoken_languages: SpokenLanguage[];
  status: string;
  tagline: string | null;
  video: boolean;
  vote_count: number;
}

export interface TvDetails extends Omit<TvCard, "mediaType"> {
  mediaType: "tv";
  created_by: PersonCard[];
  episode_run_time: number[];
  genres: Genre[];
  homepage: string;
  in_production: boolean;
  languages: string[];
  last_air_date: string;
  last_episode_to_air: unknown; // Simplified
  next_episode_to_air: unknown; // Simplified
  networks: unknown[]; // Simplified
  number_of_episodes: number;
  number_of_seasons: number;
  origin_country: string[];
  original_language: string;
  original_name: string;
  popularity: number;
  production_companies: ProductionCompany[];
  production_countries: ProductionCountry[];
  seasons: unknown[]; // Simplified
  spoken_languages: SpokenLanguage[];
  status: string;
  tagline: string;
  type: string;
  vote_count: number;
}

export interface PersonDetails extends Omit<PersonCard, "mediaType"> {
  mediaType: "person";
  also_known_as: string[];
  biography: string;
  birthday: string | null;
  deathday: string | null;
  gender: number;
  homepage: string | null;
  imdb_id: string;
  place_of_birth: string | null;
  popularity: number;
}
