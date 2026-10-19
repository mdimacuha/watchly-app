import { tmdbFetch, PROVIDERS_REVALIDATE } from '@/server/tmdb/client';
import { getJustWatchOffers } from '@/services/justwatch';
import { cleanProviderName } from '@/utils/providers';

// What a title alert watches, read for one region: the streaming services
// (TMDB, then JustWatch for the same region — the card rules) and, for tv,
// the latest season that has started airing.

export interface TitleState {
  title: string;
  /** Streaming services (subscription, ads or free), cleaned and deduped. */
  providers: string[];
  /**
   * False when neither source could say anything for the region (JustWatch
   * miss or failure). An empty list is then "unknown", not "left every
   * service", and must not fire a leaving alert.
   */
  providersKnown: boolean;
  /** Highest season with an aired episode (specials ignored); null if none. */
  latestSeason: number | null;
}

interface RawDetails {
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  last_episode_to_air?: { season_number?: number } | null;
}

type ProviderRow = { provider_name: string };
interface RawProviders {
  results?: Record<
    string,
    { flatrate?: ProviderRow[]; ads?: ProviderRow[]; free?: ProviderRow[]; rent?: ProviderRow[]; buy?: ProviderRow[] }
  >;
}

function dedupeNames(names: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of names) {
    const key = n.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(n);
  }
  return out;
}

/**
 * Current state of a title in `region`. `fresh` skips the data cache (the
 * cron wants today's answer); otherwise it reads what the title page shows.
 */
export async function getTitleState(
  mediaType: 'movie' | 'tv',
  mediaId: string,
  region: string,
  { fresh = false }: { fresh?: boolean } = {},
): Promise<TitleState> {
  const [details, providers] = await Promise.all([
    tmdbFetch<RawDetails>(`/${mediaType}/${mediaId}`, undefined, fresh ? { cache: 'no-store' } : {}),
    tmdbFetch<RawProviders>(
      `/${mediaType}/${mediaId}/watch/providers`,
      undefined,
      { cache: fresh ? 'no-store' : { revalidate: PROVIDERS_REVALIDATE } },
    ),
  ]);

  const title = details.title ?? details.name ?? '';
  const season = details.last_episode_to_air?.season_number;
  const latestSeason = mediaType === 'tv' && season && season > 0 ? season : null;

  const regionData = providers.results?.[region];
  const streaming = [...(regionData?.flatrate ?? []), ...(regionData?.ads ?? []), ...(regionData?.free ?? [])];
  if (streaming.length > 0) {
    return {
      title,
      providers: dedupeNames(streaming.map((p) => cleanProviderName(p.provider_name))),
      providersKnown: true,
      latestSeason,
    };
  }
  // TMDB lists the region (rent/buy only): known, not streaming.
  if (regionData) return { title, providers: [], providersKnown: true, latestSeason };

  // Nothing on TMDB for the region: JustWatch, same region only.
  const date = details.release_date || details.first_air_date || '';
  const jw = title
    ? await getJustWatchOffers({
        tmdbId: mediaId,
        mediaType,
        title,
        year: /^\d{4}/.test(date) ? date.slice(0, 4) : null,
        region,
      }).catch(() => null)
    : null;
  if (!jw) return { title, providers: [], providersKnown: false, latestSeason };
  return {
    title,
    providers: dedupeNames(jw.providers.streaming.map((p) => p.provider_name)),
    providersKnown: true,
    latestSeason,
  };
}
