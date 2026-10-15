import { tmdbFetch } from "@/server/tmdb/client";
import { collection } from "@/server/tmdb/endpoints/collection";
import { getJustWatchOffers } from "@/services/justwatch";
import { cleanProviderName } from "@/utils/providers";
import { mapWithConcurrency } from "@/lib/concurrency";

export interface CollectionPart {
  id: number;
  title: string;
  posterPath: string | null;
  releaseDate: string | null;
  overview: string;
  backdropPath: string | null;
  voteAverage: number;
  providerBadges: {
    provider_name: string;
    logo_path: string;
  }[];
}

export interface CollectionPayload {
  id: number;
  name: string;
  overview: string;
  posterPath: string | null;
  backdropPath: string | null;
  parts: CollectionPart[];
}

function dedupeProviders(
  rows: { provider_name: string; logo_path: string }[],
): { provider_name: string; logo_path: string }[] {
  const seen = new Set<string>();
  const out: { provider_name: string; logo_path: string }[] = [];
  for (const r of rows) {
    const key = r.provider_name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

interface TmdbCollectionDetails {
  id: number;
  name: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  parts: {
    id: number;
    title: string;
    overview: string;
    poster_path: string | null;
    backdrop_path: string | null;
    release_date: string;
    vote_average: number;
    popularity: number;
  }[];
}

export async function getCollectionDetails(collectionId: string, region = "US"): Promise<CollectionPayload> {
  const data = await tmdbFetch<TmdbCollectionDetails>(`/collection/${collectionId}`);

  // Fetch providers for all parts
  const partsWithProviders = await mapWithConcurrency(
    data.parts,
    5,
    async (part) => {
      let providerBadges: { provider_name: string; logo_path: string }[] = [];
      try {
        // Fetch providers for this specific movie
        type ProviderResult = { provider_name: string; logo_path: string };
        type ProvidersResponse = {
          results?: Record<string, { flatrate?: ProviderResult[] }>;
        };
        const providers = await tmdbFetch<ProvidersResponse>(`/movie/${part.id}/watch/providers`);
        const regionProviders = providers.results?.[region];

        if (regionProviders?.flatrate && regionProviders.flatrate.length > 0) {
          providerBadges = dedupeProviders(
            regionProviders.flatrate.map((p) => ({
              provider_name: cleanProviderName(p.provider_name),
              logo_path: p.logo_path,
            })),
          );
        } else {
          // Tier 2: JustWatch in the user's region.
          const year = part.release_date
            ? new Date(part.release_date).getFullYear().toString()
            : null;
          const fallback = await getJustWatchOffers({
            tmdbId: part.id,
            mediaType: "movie",
            title: part.title,
            year,
            region,
          });
          if (fallback && fallback.providers.streaming.length > 0) {
            providerBadges = fallback.providers.streaming.map((p) => ({
              provider_name: p.provider_name,
              logo_path: p.logo_path ?? "",
            }));
          } else if (region !== "US") {
            // Tier 3: TMDB US flatrate as a last-resort fallback. Silent on
            // cards since there's no room for a "showing US availability"
            // note — matches the legacy Watchly behavior.
            const us = providers.results?.["US"];
            if (us?.flatrate && us.flatrate.length > 0) {
              providerBadges = dedupeProviders(
                us.flatrate.map((p) => ({
                  provider_name: cleanProviderName(p.provider_name),
                  logo_path: p.logo_path,
                })),
              );
            }
          }
        }
      } catch (e) {
        // Ignore provider fetch errors to allow page to render without them
        console.warn(`Failed to fetch providers for movie ${part.id}`, e);
      }

      return {
        ...part,
        providerBadges,
      };
    },
  );

  // Sort parts by release date
  const sortedParts = partsWithProviders.sort((a, b) => {
    const dateA = new Date(a.release_date || "9999-12-31").getTime();
    const dateB = new Date(b.release_date || "9999-12-31").getTime();
    return dateA - dateB;
  });

  return {
    id: data.id,
    name: data.name,
    overview: data.overview,
    posterPath: data.poster_path,
    backdropPath: data.backdrop_path,
    parts: sortedParts.map((part) => ({
      id: part.id,
      title: part.title,
      posterPath: part.poster_path,
      backdropPath: part.backdrop_path,
      releaseDate: part.release_date,
      overview: part.overview,
      voteAverage: part.vote_average,
      providerBadges: part.providerBadges,
    })),
  };
}

export async function searchCollections(query: string, page = 1) {
  return collection.search(query, page);
}

export async function getTrendingCollections(page = 1) {
  return collection.trending(page);
}

export async function getCollectionImages(id: number) {
  return collection.images(id);
}
