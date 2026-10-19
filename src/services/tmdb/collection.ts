import { tmdbFetch } from "@/server/tmdb/client";
import { collection } from "@/server/tmdb/endpoints/collection";
import { getJustWatchOffers } from "@/services/justwatch";
import { cleanProviderName } from "@/utils/providers";
import { mapWithConcurrency } from "@/lib/concurrency";
import { z } from "zod";
import { TmdbError } from "@/server/tmdb/errors";
import { NotFoundAppError, ValidationAppError } from "@/utils/errors";

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

/**
 * Collection + its films. Badges are looked up only when `region` is given;
 * the (cached) collection page omits it and fills badges in client-side for
 * the visitor's region (useRegionBadges), so no one country is baked into
 * the HTML.
 */
export async function getCollectionDetails(collectionId: string, region?: string): Promise<CollectionPayload> {
  const data = await tmdbFetch<TmdbCollectionDetails>(`/collection/${collectionId}`);

  // Fetch providers for all parts (only when a region was asked for)
  const partsWithProviders = await mapWithConcurrency(
    data.parts,
    5,
    async (part) => {
      let providerBadges: { provider_name: string; logo_path: string }[] = [];
      if (!region) return { ...part, providerBadges };
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
          }
          // No fallback to another country.
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

// ---------------------------------------------------------------------------
// Quick View — a light collection preview (no per-film provider lookups)
// ---------------------------------------------------------------------------

export interface CollectionQuickViewPart {
  id: number;
  title: string;
  year: string | null;
  posterPath: string | null;
  voteAverage: number | null;
  /** Minutes; null when TMDB has no runtime yet (e.g. unreleased). */
  runtimeMinutes: number | null;
}

export interface CollectionQuickViewPayload {
  id: number;
  name: string;
  overview: string;
  posterPath: string | null;
  backdropPath: string | null;
  /** Films in release order; unreleased (no date) last. */
  parts: CollectionQuickViewPart[];
  /** Sum of the known runtimes, minutes. */
  totalRuntimeMinutes: number;
  /** e.g. "1973–2023"; null when no film has a date. */
  yearSpan: string | null;
}

const collectionIdSchema = z.coerce.number().int().positive();

/**
 * Collection preview for the Quick View popup: details plus each film's
 * runtime (one cached TMDB detail per film, 6 at a time — collections are
 * small). Region-agnostic: no provider lookups, unlike getCollectionDetails.
 */
export async function getCollectionQuickView(id: string): Promise<CollectionQuickViewPayload> {
  const parsed = collectionIdSchema.safeParse(id);
  if (!parsed.success) throw new ValidationAppError("Invalid collection id");

  let data: TmdbCollectionDetails;
  try {
    data = await tmdbFetch<TmdbCollectionDetails>(`/collection/${parsed.data}`);
  } catch (err) {
    if (err instanceof TmdbError && err.status === 404) throw new NotFoundAppError("Collection not found");
    throw err;
  }

  const ordered = [...data.parts].sort((a, b) => {
    if (!a.release_date) return 1;
    if (!b.release_date) return -1;
    return a.release_date.localeCompare(b.release_date);
  });

  const runtimes = await mapWithConcurrency(ordered, 6, (p) =>
    tmdbFetch<{ runtime?: number | null }>(`/movie/${p.id}`)
      .then((d) => d.runtime || null)
      .catch(() => null),
  );

  const parts: CollectionQuickViewPart[] = ordered.map((p, i) => ({
    id: p.id,
    title: p.title,
    year: p.release_date ? p.release_date.slice(0, 4) : null,
    posterPath: p.poster_path,
    voteAverage: p.vote_average || null,
    runtimeMinutes: runtimes[i],
  }));

  const years = parts.map((p) => p.year).filter((y): y is string => !!y);
  const first = years[0];
  const last = years[years.length - 1];

  return {
    id: data.id,
    name: data.name,
    overview: data.overview,
    posterPath: data.poster_path,
    backdropPath: data.backdrop_path,
    parts,
    totalRuntimeMinutes: parts.reduce((n, p) => n + (p.runtimeMinutes ?? 0), 0),
    yearSpan: first ? (first === last ? first : `${first}–${last}`) : null,
  };
}
