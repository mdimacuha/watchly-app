import { tmdbFetch } from "@/server/tmdb/client";

export interface TvEpisodeCrew {
  id: number;
  credit_id: string;
  name: string;
  department: string;
  job: string;
  profile_path: string | null;
}

export interface TvEpisodeGuestStar {
  id: number;
  name: string;
  credit_id: string;
  character: string;
  order: number;
  profile_path: string | null;
}

export interface TvEpisodePayload {
  id: number;
  name: string;
  overview: string;
  vote_average: number;
  vote_count: number;
  air_date: string;
  episode_number: number;
  production_code: string;
  runtime: number | null;
  season_number: number;
  show_id: number;
  still_path: string | null;
  crew: TvEpisodeCrew[];
  guest_stars: TvEpisodeGuestStar[];
  seriesName: string;
}

interface TmdbTvEpisodeDetails {
  air_date: string;
  crew: TvEpisodeCrew[];
  episode_number: number;
  guest_stars: TvEpisodeGuestStar[];
  name: string;
  overview: string;
  id: number;
  production_code: string;
  runtime: number;
  season_number: number;
  still_path: string | null;
  vote_average: number;
  vote_count: number;
}

// Need to fetch basic TV details to get series name
interface TmdbTvBasic {
  name: string;
}

export async function getTvEpisodeDetails(
  seriesId: string,
  seasonNumber: string,
  episodeNumber: string
): Promise<TvEpisodePayload> {
  const [data, tvData] = await Promise.all([
    tmdbFetch<TmdbTvEpisodeDetails>(
      `/tv/${seriesId}/season/${seasonNumber}/episode/${episodeNumber}`
    ),
    tmdbFetch<TmdbTvBasic>(`/tv/${seriesId}`)
  ]);

  return {
    id: data.id,
    name: data.name,
    overview: data.overview,
    vote_average: data.vote_average,
    vote_count: data.vote_count,
    air_date: data.air_date,
    episode_number: data.episode_number,
    production_code: data.production_code,
    runtime: data.runtime,
    season_number: data.season_number,
    show_id: parseInt(seriesId, 10),
    still_path: data.still_path,
    crew: data.crew,
    guest_stars: data.guest_stars,
    seriesName: tvData.name,
  };
}
