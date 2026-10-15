import { tmdbEnv } from "@/server/env/tmdb";
import { TmdbError } from "./errors";

export type TmdbCacheOption = "no-store" | "force-cache" | { revalidate: number };

/**
 * Revalidate window for streaming availability (watch/providers), in seconds.
 * Shorter than the 24h catalog default because availability is the one TMDB
 * dataset users notice going stale.
 */
export const PROVIDERS_REVALIDATE = 21600; // 6h

export interface TmdbFetchOptions {
  language?: string;
  region?: string;
  includeAdult?: boolean;
  cache?: TmdbCacheOption;
}

export async function tmdbFetch<T>(
  path: string,
  params?: Record<string, string | number | boolean | undefined | null | (string | number)[]>,
  options: TmdbFetchOptions = {}
): Promise<T> {
  const url = new URL(`${tmdbEnv.TMDB_API_BASE_URL}${path}`);

  // Default query params
  if (options.language) url.searchParams.set("language", options.language);
  if (options.region) url.searchParams.set("region", options.region);
  if (options.includeAdult !== undefined) {
    url.searchParams.set("include_adult", String(options.includeAdult));
  }

  // Additional query params
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        if (Array.isArray(value)) {
          url.searchParams.set(key, value.join(","));
        } else {
          url.searchParams.set(key, String(value));
        }
      }
    });
  }

  const headers = {
    Authorization: `Bearer ${tmdbEnv.TMDB_API_READ_TOKEN}`,
    Accept: "application/json",
  };

  // Determine cache/revalidate strategy
  let cacheMode: RequestCache | undefined;
  // 24h default. TMDB catalog data (details, credits, videos, images, people,
  // collections, seasons) is effectively immutable day to day. This is also a
  // hard ceiling on the ISR pages that read it: Next revalidates a route at the
  // LOWEST revalidate among its segment config and its fetches, so a shorter
  // default here would silently cap the public pages' `revalidate` and rewrite
  // every cached page that often. Availability is pinned shorter — see
  // movie.watchProviders / tv.watchProviders.
  let nextRevalidate: number | false | undefined = 86400; // Default

  if (options.cache) {
    if (options.cache === "no-store") {
      cacheMode = "no-store";
      nextRevalidate = undefined;
    } else if (options.cache === "force-cache") {
      cacheMode = "force-cache";
      nextRevalidate = false; // Cache forever / indefinitely
    } else if (typeof options.cache === "object" && typeof options.cache.revalidate === "number") {
      cacheMode = undefined;
      nextRevalidate = options.cache.revalidate;
    }
  }

  const response = await fetch(url.toString(), {
    headers,
    cache: cacheMode,
    next: nextRevalidate !== undefined ? { revalidate: nextRevalidate } : undefined,
  });

  if (!response.ok) {
    let errorData: { status_code?: number; status_message?: string } | undefined;
    try {
      errorData = await response.json();
    } catch {
      // ignore JSON parse error
    }

    throw new TmdbError(
      response.status,
      response.statusText,
      errorData?.status_code,
      errorData?.status_message
    );
  }

  return response.json() as Promise<T>;
}

