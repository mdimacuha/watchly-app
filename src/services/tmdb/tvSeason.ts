import { tmdbFetch } from "@/server/tmdb/client";

export interface TvEpisodeSummary {
  id: number;
  episodeNumber: number;
  name: string;
  overview: string;
  stillPath: string | null;
  airDate: string | null;
  runtime: number | null;
  voteAverage: number;
}

export interface TvSeasonPayload {
  id: number; // Season ID
  seriesId: number;
  seasonNumber: number;
  name: string;
  overview: string;
  airDate: string | null;
  posterPath: string | null;
  episodes: TvEpisodeSummary[];
  seriesName: string; // Add series name
}

interface TmdbTvSeasonDetails {
  _id: string;
  air_date: string;
  episodes: {
    air_date: string;
    episode_number: number;
    id: number;
    name: string;
    overview: string;
    production_code: string;
    runtime: number | null;
    season_number: number;
    show_id: number;
    still_path: string | null;
    vote_average: number;
    vote_count: number;
    crew: unknown[];
    guest_stars: unknown[];
  }[];
  name: string;
  overview: string;
  id: number;
  poster_path: string | null;
  season_number: number;
  vote_average: number;
}

// Need to fetch basic TV details to get series name if not in season details
interface TmdbTvBasic {
  name: string;
}

export async function getTvSeasonDetails(
  seriesId: string,
  seasonNumber: string
): Promise<TvSeasonPayload> {
  const [seasonData, tvData] = await Promise.all([
    tmdbFetch<TmdbTvSeasonDetails>(`/tv/${seriesId}/season/${seasonNumber}`),
    tmdbFetch<TmdbTvBasic>(`/tv/${seriesId}`)
  ]);

  return {
    id: seasonData.id,
    seriesId: parseInt(seriesId, 10),
    seasonNumber: seasonData.season_number,
    name: seasonData.name,
    overview: seasonData.overview,
    airDate: seasonData.air_date,
    posterPath: seasonData.poster_path,
    seriesName: tvData.name,
    episodes: seasonData.episodes.map((ep) => ({
      id: ep.id,
      episodeNumber: ep.episode_number,
      name: ep.name,
      overview: ep.overview,
      stillPath: ep.still_path,
      airDate: ep.air_date,
      runtime: ep.runtime,
      voteAverage: ep.vote_average,
    })),
  };
}
