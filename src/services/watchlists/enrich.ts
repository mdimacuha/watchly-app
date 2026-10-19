import { tmdbFetch } from '@/server/tmdb/client';
import { mapMovieDetails, mapTvDetails } from '@/server/tmdb/mappers';
import type { MovieDetails, TvDetails } from '@/server/tmdb/types';
import type { WatchlistMediaType, WatchlistItemStatus } from './validators';
import { getJustWatchOffers } from '@/services/justwatch';
import { cleanProviderName } from '@/utils/providers';
import { mapWithConcurrency } from '@/lib/concurrency';

export interface WatchProviderSummary {
  /** TMDB provider id (used by ProviderBadge for style lookup). */
  providerId: number;
  providerName: string;
  logoPath: string | null;
}

type CommonFields = {
  id: string;
  mediaId: string;
  addedAt: string;
  runtime: number | null;
  provider: WatchProviderSummary | null;
  /**
   * True once providers were resolved for the viewer's region. With a null
   * `provider` the card shows "Not in your region".
   */
  availabilityChecked: boolean;
  isFavorite: boolean;
  status: WatchlistItemStatus;
  /** ISO when the user first set status to watching/rewatch. */
  startedAt: string | null;
  /** ISO when the user set status to finished. */
  finishedAt: string | null;
  /** ISO when the curator first ranked it; null = "Recently Added". */
  rankedAt: string | null;
  notes: string | null;
};

export type EnrichedWatchlistItem =
  | (CommonFields & { type: 'movie'; data: MovieDetails })
  | (CommonFields & { type: 'tv'; data: TvDetails });

interface RawItem {
  id: string;
  mediaType: WatchlistMediaType;
  mediaId: string;
  createdAt: Date;
  status: WatchlistItemStatus;
  startedAt: Date | null;
  finishedAt: Date | null;
  rankedAt: Date | null;
  notes: string | null;
}

const TMDB_PATH: Record<WatchlistMediaType, string> = {
  movie: '/movie',
  tv: '/tv',
};

interface WatchProvidersResponse {
  results?: Record<
    string,
    {
      flatrate?: Array<{ provider_id: number; provider_name: string; logo_path: string | null }>;
      ads?: Array<{ provider_id: number; provider_name: string; logo_path: string | null }>;
      free?: Array<{ provider_id: number; provider_name: string; logo_path: string | null }>;
      rent?: Array<{ provider_id: number; provider_name: string; logo_path: string | null }>;
      buy?: Array<{ provider_id: number; provider_name: string; logo_path: string | null }>;
    }
  >;
}

// Strict: looks at one region only. The fallback chain lives in
// resolveProvider below — this stays single-purpose so the chain stays clear.
function pickFromRegion(
  watchProviders: WatchProvidersResponse | undefined,
  region: string,
): WatchProviderSummary | null {
  const regionData = watchProviders?.results?.[region];
  if (!regionData) return null;

  const candidate =
    regionData.flatrate?.[0] ??
    regionData.ads?.[0] ??
    regionData.free?.[0] ??
    regionData.rent?.[0] ??
    regionData.buy?.[0];

  if (!candidate) return null;
  return {
    providerId: candidate.provider_id,
    providerName: cleanProviderName(candidate.provider_name),
    logoPath: candidate.logo_path,
  };
}

/**
 * Provider resolution for a watchlist item, mirroring the chain used on
 * search cards — user's region only, never another country:
 *   1. TMDB user region
 *   2. JustWatch (user region) — covers titles TMDB hasn't ingested for
 *      smaller regions, e.g. Lost in PH → Disney+
 */
async function resolveProvider(opts: {
  watchProviders: WatchProvidersResponse | undefined;
  region: string;
  mediaType: WatchlistMediaType;
  mediaId: string;
  title: string;
  year: string | null;
}): Promise<WatchProviderSummary | null> {
  const t1 = pickFromRegion(opts.watchProviders, opts.region);
  if (t1) return t1;

  if (opts.title) {
    try {
      const fallback = await getJustWatchOffers({
        tmdbId: opts.mediaId,
        mediaType: opts.mediaType,
        title: opts.title,
        year: opts.year,
        region: opts.region,
      });
      const top = fallback?.providers.streaming[0];
      if (top) {
        return {
          providerId: top.provider_id,
          providerName: top.provider_name, // already cleaned by JustWatch svc
          logoPath: top.logo_path,
        };
      }
    } catch {
      // JustWatch failures are non-fatal — treat as no provider.
    }
  }

  // No fallback to another country: null means "not in your region".
  return null;
}

// One TMDB detail fetch per item (1h Data Cache). 10 in flight halves the
// cold-cache wall time vs 5 and stays well under TMDB's rate limit.
const ENRICH_CONCURRENCY = 10;

export async function enrichWatchlistItems(
  items: RawItem[],
  region = 'US',
  favoriteSet: Set<string> = new Set(),
): Promise<EnrichedWatchlistItem[]> {
  const results = await mapWithConcurrency(items, ENRICH_CONCURRENCY, async (it) => {
    const isFav = favoriteSet.has(`${it.mediaType}:${it.mediaId}`);
    try {
      const raw = await tmdbFetch<Record<string, unknown> & { 'watch/providers'?: WatchProvidersResponse; episode_run_time?: number[]; runtime?: number }>(
        `${TMDB_PATH[it.mediaType]}/${it.mediaId}`,
        { append_to_response: 'watch/providers' },
      );

      if (it.mediaType === 'movie') {
        const details = mapMovieDetails({ ...raw, media_type: 'movie' });
        const year = details.releaseDate
          ? new Date(details.releaseDate).getFullYear().toString()
          : null;
        const provider = await resolveProvider({
          watchProviders: raw['watch/providers'],
          region,
          mediaType: 'movie',
          mediaId: it.mediaId,
          title: details.title,
          year,
        });
        return {
          id: it.id,
          type: 'movie' as const,
          data: details,
          mediaId: it.mediaId,
          addedAt: it.createdAt.toISOString(),
          runtime: details.runtime ?? null,
          provider,
          availabilityChecked: true,
          isFavorite: isFav,
          status: it.status,
          startedAt: it.startedAt?.toISOString() ?? null,
          finishedAt: it.finishedAt?.toISOString() ?? null,
          rankedAt: it.rankedAt?.toISOString() ?? null,
          notes: it.notes,
        };
      }

      const details = mapTvDetails({ ...raw, media_type: 'tv' });
      const year = details.firstAirDate
        ? new Date(details.firstAirDate).getFullYear().toString()
        : null;
      const provider = await resolveProvider({
        watchProviders: raw['watch/providers'],
        region,
        mediaType: 'tv',
        mediaId: it.mediaId,
        title: details.name,
        year,
      });
      // TV uses an array of per-episode runtimes; surface the first.
      const runtime =
        Array.isArray(details.episode_run_time) && details.episode_run_time.length > 0
          ? details.episode_run_time[0]
          : null;
      return {
        id: it.id,
        type: 'tv' as const,
        data: details,
        mediaId: it.mediaId,
        addedAt: it.createdAt.toISOString(),
        runtime,
        provider,
        availabilityChecked: true,
        isFavorite: isFav,
        status: it.status,
        startedAt: it.startedAt?.toISOString() ?? null,
        finishedAt: it.finishedAt?.toISOString() ?? null,
        rankedAt: it.rankedAt?.toISOString() ?? null,
        notes: it.notes,
      };
    } catch {
      return null;
    }
  });
  return results.filter((r): r is EnrichedWatchlistItem => r !== null);
}
