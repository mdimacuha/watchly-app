import { tmdbFetch } from "@/server/tmdb/client";
import { TmdbVideo, Genre } from "@/server/tmdb/types";
import { getGenreName } from "@/lib/tmdb-genres";

export interface PersonDetails {
  id: number;
  name: string;
  biography: string;
  birthday: string | null;
  deathday: string | null;
  placeOfBirth: string | null;
  profilePath: string | null;
  knownForDepartment: string;
}

export interface Credit {
  id: number;
  title: string;
  posterPath: string | null;
  releaseDate: string | null;
  character?: string;
  job?: string;
  department?: string;
  mediaType: "movie" | "tv";
  voteAverage: number;
  genreIds: number[];
  genre: string;
  availability?: { provider_name: string }[];
}

export interface PersonPagePayload {
  details: PersonDetails;
  credits: {
    cast: Credit[];
    crew: Credit[];
  };
}

interface TmdbPersonDetails {
  id: number;
  name: string;
  biography: string;
  birthday: string | null;
  deathday: string | null;
  place_of_birth: string | null;
  profile_path: string | null;
  known_for_department: string;
}

interface TmdbCombinedCredit {
  id: number;
  title?: string;
  name?: string;
  poster_path: string | null;
  release_date?: string;
  first_air_date?: string;
  character?: string;
  job?: string;
  department?: string;
  vote_average: number;
  vote_count: number;
  genre_ids: number[];
  popularity?: number;
  media_type: "movie" | "tv";
}

interface TmdbCombinedCredits {
  cast: TmdbCombinedCredit[];
  crew: TmdbCombinedCredit[];
}

interface TmdbProviderResult {
  link: string;
  flatrate?: { provider_name: string; display_priority?: number }[];
  rent?: { provider_name: string; display_priority?: number }[];
  buy?: { provider_name: string; display_priority?: number }[];
}

interface TmdbWatchProviders {
  results: Record<string, TmdbProviderResult>;
}

export async function getPersonPagePayload(id: string, region = "US"): Promise<PersonPagePayload> {
  const numericId = parseInt(id, 10);
  if (isNaN(numericId)) {
    throw new Error("Invalid ID");
  }

  const [details, credits] = await Promise.all([
    tmdbFetch<TmdbPersonDetails>(`/person/${numericId}`),
    tmdbFetch<TmdbCombinedCredits>(`/person/${numericId}/combined_credits`),
  ]);

  // Identify top credits to fetch providers for
  // Strategy:
  // 1. Get top 40 most popular (hits usually have providers)
  // 2. Get top 40 most recent (what users see first in the UI sorted by date)
  // 3. Merge and dedupe
  
  const creditsList = [
    ...credits.cast.map(c => ({ ...c, creditType: 'cast' })),
    ...credits.crew.map(c => ({ ...c, creditType: 'crew' }))
  ];

  const topCredits = new Map<string, { id: number; mediaType: "movie" | "tv" }>();
  
  const addToMap = (list: typeof creditsList) => {
    for (const credit of list) {
      if (credit.media_type === "movie" || credit.media_type === "tv") {
        const key = `${credit.media_type}:${credit.id}`;
        if (!topCredits.has(key)) {
          topCredits.set(key, { id: credit.id, mediaType: credit.media_type });
        }
      }
    }
  };

  // 1. Top Popular
  const byPopularity = [...creditsList].sort((a, b) => {
    if (a.popularity !== undefined && b.popularity !== undefined) {
      return b.popularity - a.popularity;
    }
    return (b.vote_count || 0) - (a.vote_count || 0);
  });
  addToMap(byPopularity.slice(0, 40));

  // 2. Most Recent (Future & Recent Past)
  const byDate = [...creditsList].sort((a, b) => {
    const dateA = new Date(a.release_date || a.first_air_date || "1900-01-01").getTime();
    const dateB = new Date(b.release_date || b.first_air_date || "1900-01-01").getTime();
    return dateB - dateA;
  });
  addToMap(byDate.slice(0, 40));

  // Fetch providers for top credits in parallel
  const providerPromises = Array.from(topCredits.values()).map(async ({ id, mediaType }) => {
    try {
      const data = await tmdbFetch<TmdbWatchProviders>(`/${mediaType}/${id}/watch/providers`, undefined, { cache: { revalidate: 21600 } });
      const regionData = data.results[region];
      
      if (!regionData) return { id, mediaType, providers: [] };

      // Process providers (streaming, rent, buy only for badges)
      const allOptions = [
        ...(regionData.flatrate || []),
        ...(regionData.rent || []),
        ...(regionData.buy || [])
      ];

      const seen = new Set<string>();
      const providers: { provider_name: string; display_priority?: number }[] = [];

      for (const p of allOptions) {
        let name = p.provider_name;
        // Simple normalization
        if (name === "Amazon Prime Video") name = "Prime Video";
        if (name === "Apple TV Plus") name = "Apple TV+";
        if (name === "Google Play Movies") name = "Google Play";
        if (name === "YouTube Premium") name = "YouTube";

        if (!seen.has(name)) {
          seen.add(name);
          providers.push({ provider_name: name, display_priority: p.display_priority });
        }
      }

      providers.sort((a, b) => (a.display_priority || 999) - (b.display_priority || 999));
      return { id, mediaType, providers };
    } catch (e) {
      console.error(`Failed to fetch providers for ${mediaType} ${id}`, e);
      return { id, mediaType, providers: [] };
    }
  });

  const providersMap = new Map<string, { provider_name: string }[]>();
  const providersResults = await Promise.all(providerPromises);
  providersResults.forEach(r => {
    if (r.providers.length > 0) {
      providersMap.set(`${r.mediaType}:${r.id}`, r.providers);
    }
  });

  return {
    details: {
      id: details.id,
      name: details.name,
      biography: details.biography,
      birthday: details.birthday,
      deathday: details.deathday,
      placeOfBirth: details.place_of_birth,
      profilePath: details.profile_path,
      knownForDepartment: details.known_for_department,
    },
    credits: {
      cast: credits.cast.map((c) => ({
        id: c.id,
        title: c.title || c.name || "Unknown Title",
        posterPath: c.poster_path,
        releaseDate: c.release_date || c.first_air_date || null,
        character: c.character,
        mediaType: c.media_type,
        voteAverage: c.vote_average,
        genreIds: c.genre_ids ?? [],
        genre: (c.genre_ids?.length ?? 0) > 0 ? getGenreName(c.genre_ids[0]) : "Unknown",
        availability: providersMap.get(`${c.media_type}:${c.id}`),
      })),
      crew: credits.crew.map((c) => ({
        id: c.id,
        title: c.title || c.name || "Unknown Title",
        posterPath: c.poster_path,
        releaseDate: c.release_date || c.first_air_date || null,
        job: c.job,
        department: c.department,
        mediaType: c.media_type,
        voteAverage: c.vote_average,
        genreIds: c.genre_ids ?? [],
        genre: (c.genre_ids?.length ?? 0) > 0 ? getGenreName(c.genre_ids[0]) : "Unknown",
        availability: providersMap.get(`${c.media_type}:${c.id}`),
      })),
    },
  };
}
