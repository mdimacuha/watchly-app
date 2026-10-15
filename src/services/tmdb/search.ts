import { movie, tv, search, discover, trending } from '@/server/tmdb';
import { SearchResult } from '@/server/tmdb/types';
import { SearchResponse, SearchResponseItem } from '@/types/tmdb';
import { getUserRegion } from '@/services/preferences';
import { getJustWatchOffers } from '@/services/justwatch';
import { cleanProviderName } from '@/utils/providers';

export interface SearchParams {
  q?: string;
  type?: 'all' | 'movie' | 'tv';
  year?: string;
  genre?: string;
  service?: string;
  page?: string;
  region?: string;
}

interface ProviderEntry {
  provider_name: string;
  logo_path: string | null;
}

// Normalize raw TMDB provider rows and dedupe so the badge strip on cards
// doesn't show "Amazon Prime Video" + "Amazon Prime Video With Ads" as two
// separate pills.
function cleanProviders(
  rows: { provider_name: string; logo_path: string | null }[],
): ProviderEntry[] {
  const seen = new Set<string>();
  const out: ProviderEntry[] = [];
  for (const r of rows) {
    const name = cleanProviderName(r.provider_name);
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ provider_name: name, logo_path: r.logo_path });
  }
  return out;
}

// JustWatch fallback for search/discover cards when TMDB has no providers for
// the user's region. Returns the same `ProviderEntry[]` shape the rest of
// the search service expects.
async function fetchJustWatchProviders(
  item: SearchResult,
  region: string,
): Promise<ProviderEntry[] | null> {
  if (item.mediaType !== 'movie' && item.mediaType !== 'tv') return null;

  const title =
    item.mediaType === 'movie' ? item.title : item.name;
  const date =
    item.mediaType === 'movie' ? item.releaseDate : item.firstAirDate;
  const year = date ? new Date(date).getFullYear().toString() : null;
  if (!title) return null;

  const fallback = await getJustWatchOffers({
    tmdbId: item.id,
    mediaType: item.mediaType,
    title,
    year,
    region,
  });
  if (!fallback) return null;

  // JustWatch already runs names through cleanProviderName, so no second pass.
  if (fallback.providers.streaming.length > 0) {
    return fallback.providers.streaming.map(p => ({
      provider_name: p.provider_name,
      logo_path: p.logo_path,
    }));
  }
  if (fallback.providers.rent.length > 0 || fallback.providers.buy.length > 0) {
    return [{ provider_name: 'Rent', logo_path: null }];
  }
  return null;
}

async function fetchProvidersForResults(
  results: SearchResult[],
  region: string
): Promise<Map<string, ProviderEntry[]>> {
  const providersMap = new Map<string, ProviderEntry[]>();

  // Only fetch for movies and tv shows
  const items = results.filter(
    item => item.mediaType === 'movie' || item.mediaType === 'tv'
  );

  if (items.length === 0) return providersMap;

  // We limit concurrency to avoid hitting rate limits too hard
  // Fetch in batches of 5
  const batchSize = 5;
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);

    await Promise.all(
      batch.map(async item => {
        try {
          const result =
            item.mediaType === 'movie'
              ? await movie.watchProviders(item.id)
              : await tv.watchProviders(item.id);

          const regionData = result.results?.[region];

          const flatrateLike = [
            ...(regionData?.flatrate || []),
            ...(regionData?.ads || []),
            ...(regionData?.free || []),
          ];
          const hasRentOrBuy =
            (regionData?.rent?.length ?? 0) > 0 ||
            (regionData?.buy?.length ?? 0) > 0;

          if (flatrateLike.length > 0) {
            providersMap.set(
              `${item.mediaType}-${item.id}`,
              cleanProviders(flatrateLike),
            );
            return;
          }

          if (hasRentOrBuy) {
            providersMap.set(`${item.mediaType}-${item.id}`, [
              { provider_name: 'Rent', logo_path: null },
            ]);
            return;
          }

          // TMDB has no data for this region. Tier 2: JustWatch. Tier 3:
          // TMDB US as a last-resort fallback so titles JustWatch doesn't
          // index (e.g. Lost Girl) still get badges. Order matters — the old
          // silent US fallback caused Lost-in-PH to show Hulu; running
          // JustWatch first fixes that.
          let fallbackProviders = await fetchJustWatchProviders(item, region);

          if (!fallbackProviders && region !== "US") {
            const us = result.results?.["US"];
            const usFlatrateLike = [
              ...(us?.flatrate || []),
              ...(us?.ads || []),
              ...(us?.free || []),
            ];
            if (usFlatrateLike.length > 0) {
              fallbackProviders = cleanProviders(usFlatrateLike);
            } else if (
              (us?.rent?.length ?? 0) > 0 ||
              (us?.buy?.length ?? 0) > 0
            ) {
              fallbackProviders = [{ provider_name: "Rent", logo_path: null }];
            }
          }

          if (fallbackProviders) {
            providersMap.set(
              `${item.mediaType}-${item.id}`,
              fallbackProviders,
            );
          }
        } catch (error: unknown) {
          // Silently fail for individual provider fetches
          console.warn(
            `Failed to fetch providers for ${item.mediaType} ${item.id}`,
            error
          );
        }
      })
    );
  }

  return providersMap;
}

function mapToResponseItem(
  item: SearchResult,
  providersMap: Map<string, ProviderEntry[]>
): SearchResponseItem | null {
  if (item.mediaType !== 'movie' && item.mediaType !== 'tv') {
    return null;
  }

  const title =
    item.mediaType === 'movie'
      ? item.title
      : item.mediaType === 'tv'
        ? item.name
        : '';
  const date =
    item.mediaType === 'movie'
      ? item.releaseDate
      : item.mediaType === 'tv'
        ? item.firstAirDate
        : null;
  const year = date ? new Date(date).getFullYear().toString() : undefined;

  const itemProviders = providersMap.get(`${item.mediaType}-${item.id}`) || [];

  // Format providers for response
  const providerBadges = itemProviders.map((p) => ({
    provider_name: p.provider_name,
    logo_path: p.logo_path,
  }));

  return {
    id: item.id,
    mediaType: item.mediaType,
    title,
    year,
    posterPath:
      item.mediaType === 'movie' || item.mediaType === 'tv'
        ? item.posterPath
        : null,
    backdropPath:
      item.mediaType === 'movie' || item.mediaType === 'tv'
        ? item.backdropPath
        : null,
    overview:
      item.mediaType === 'movie' || item.mediaType === 'tv'
        ? item.overview
        : '',
    providerBadges,
  };
}

export async function searchContent(
  params: SearchParams,
  userId?: string
): Promise<SearchResponse> {
  const region =
    params.region ??
    (userId ? (await getUserRegion(userId)) ?? undefined : undefined) ??
    'US';

  const {
    q = '',
    type = 'all',
    year,
    genre,
    service,
    page: pageStr = '1',
  } = params;

  const page = parseInt(pageStr, 10);

  let rawResults: SearchResult[] = [];
  let totalPages = 1;
  let totalResults = 0;

  // Structured (non-text) filters: genre, year, and streaming service.
  const hasStructuredFilters = Boolean(year || genre || service);

  if (hasStructuredFilters) {
    // Structured-filter browse via TMDB /discover.
    //
    // Combination rule (documented): TMDB's /search endpoints accept neither
    // `with_genres` nor a watch-provider (service) filter, and only /discover
    // applies a hard release-year filter. So whenever a genre / year / service
    // filter is active we browse strictly via /discover and IGNORE the free-text
    // `q` — free-text search and structured discovery are mutually exclusive on
    // TMDB. This keeps filter behavior identical whether or not the user has also
    // typed a query, and matches the in-app deep links (e.g. /search?genre=…&type=…).
    let providers: number[] | undefined;
    if (service) {
      // Map service slug to TMDB provider ID
      const serviceMap: Record<string, number> = {
        netflix: 8,
        prime: 9, // Amazon Prime Video
        disney: 337, // Disney+
        hulu: 15,
        max: 1899, // Max (US)
        apple: 350, // Apple TV+
      };
      const providerId = serviceMap[service];
      if (providerId) providers = [providerId];
    }

    const filters = {
      page,
      region,
      year: year ? parseInt(year, 10) : undefined,
      genre: genre ? [parseInt(genre, 10)] : undefined,
      providers,
    };

    if (type === 'tv') {
      const data = await discover.tv(filters);
      rawResults = data.results;
      totalPages = data.total_pages;
      totalResults = data.total_results;
    } else {
      // Default to movie discovery for "movie" and "all" types when filters are active
      const data = await discover.movie(filters);
      rawResults = data.results;
      totalPages = data.total_pages;
      totalResults = data.total_results;
    }
  } else if (!q) {
    // No query and no filters: Fetch popular/trending content
    if (type === 'movie') {
      const data = await movie.popular({ page, region });
      rawResults = data.results;
      totalPages = data.total_pages;
      totalResults = data.total_results;
    } else if (type === 'tv') {
      const data = await tv.popular({ page, region });
      rawResults = data.results;
      totalPages = data.total_pages;
      totalResults = data.total_results;
    } else {
      // 'all' -> Use trending/all for a mix
      const data = await trending.all('day', { page, region });
      rawResults = data.results;
      totalPages = data.total_pages;
      totalResults = data.total_results;
    }
  } else {
    // Free-text search (no structured filters active).
    const searchType =
      type === 'movie' ? 'movie' : type === 'tv' ? 'tv' : 'multi';

    const filters: Parameters<typeof search>[1] = {
      page,
      region,
      type: searchType,
    };

    const gatheredResults: SearchResult[] = [];
    let currentPage = page;
    const maxPagesToFetch = 3; // Limit to avoid excessive API calls
    let fetches = 0;

    // We loop until we have enough results or hit the limit
    // We want at least 20 items (standard page size)
    while (gatheredResults.length < 20 && fetches < maxPagesToFetch) {
      filters.page = currentPage;
      const data = await search(q, filters);

      if (fetches === 0) {
        totalPages = data.total_pages;
        totalResults = data.total_results;
      }

      // Filter for valid items (movie/tv) immediately
      const validItems = data.results.filter(
        item => item.mediaType === 'movie' || item.mediaType === 'tv'
      );

      gatheredResults.push(...validItems);

      if (data.page >= data.total_pages) break;

      currentPage++;
      fetches++;
    }

    rawResults = gatheredResults.slice(0, 20);
  }

  // Fetch providers for the results
  const providersMap = await fetchProvidersForResults(rawResults, region);

  const results = rawResults
    .map(item => mapToResponseItem(item, providersMap))
    .filter((item): item is SearchResponseItem => item !== null);

  return {
    page,
    total_pages: totalPages,
    total_results: totalResults,
    results,
  };
}
