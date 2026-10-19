import { movie, tv, search, discover, trending } from '@/server/tmdb';
import type { PersonCard, SearchResult } from '@/server/tmdb/types';
import type {
  SearchPerson,
  SearchRelated,
  SearchResponse,
  SearchResponseItem,
} from '@/types/tmdb';
import { getUserRegion } from '@/services/preferences';
import { cleanProviderName } from '@/utils/providers';
import { getProvidersCatalog } from '@/server/tmdb/providersCatalog';
import { getPersonTopCredits } from '@/services/tmdb/person';
import { getCardBadges, type BadgeTarget, type CardBadge } from '@/services/providers/cardBadges';

export interface SearchParams {
  q?: string;
  type?: 'all' | 'movie' | 'tv';
  year?: string;
  genre?: string;
  service?: string;
  page?: string;
  region?: string;
}

type ProviderEntry = CardBadge;

// Card badges (user's region only, JustWatch fallback) — shared with the
// collection and artist pages via services/providers/cardBadges.
async function fetchProvidersForResults(
  results: SearchResult[],
  region: string,
): Promise<Map<string, ProviderEntry[]>> {
  const targets: BadgeTarget[] = [];
  for (const item of results) {
    if (item.mediaType !== 'movie' && item.mediaType !== 'tv') continue;
    const title = item.mediaType === 'movie' ? item.title : item.name;
    const date = item.mediaType === 'movie' ? item.releaseDate : item.firstAirDate;
    targets.push({ mediaType: item.mediaType, id: item.id, title: title ?? '', year: date ? String(new Date(date).getFullYear()) : null });
  }
  return getCardBadges(targets, region);
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

  const key = `${item.mediaType}-${item.id}`;
  const itemProviders = providersMap.get(key) || [];

  // Format providers for response
  const providerBadges = itemProviders.map((p) => ({
    provider_name: p.provider_name,
    logo_path: p.logo_path,
    provider_id: p.provider_id,
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
    genreIds:
      item.mediaType === 'movie' || item.mediaType === 'tv' ? item.genreIds : undefined,
    providerBadges,
    // Set only when providers were looked up for this title (skipped or
    // failed lookups leave it unset, so no "Not in your region" pill).
    ...(providersMap.has(key) ? { availabilityChecked: true as const } : {}),
  };
}

// TMDB watch-provider ids are global; `watch_region` scopes availability.
// (Max's id is its US listing — other regions may list HBO under its own id.)
const SERVICE_PROVIDER_IDS: Record<string, number> = {
  netflix: 8,
  prime: 9, // Amazon Prime Video
  disney: 337, // Disney+
  hulu: 15,
  max: 1899, // Max (US)
  apple: 350, // Apple TV+
};


const PEOPLE_LIMIT = 6;
// Credits shown for a person-name search ("Movies & shows with X").
const SPOTLIGHT_CREDITS = 18;
const RELATED_LIMIT = 12;
/** Posterless results are kept only if TMDB has real signal on them. */
const POSTERLESS_MIN_VOTES = 20;

function yearOf(item: SearchResult): number | null {
  const date =
    item.mediaType === 'movie'
      ? item.releaseDate
      : item.mediaType === 'tv'
        ? item.firstAirDate
        : null;
  return date ? new Date(date).getFullYear() : null;
}

function titleOf(item: SearchResult): string {
  return item.mediaType === 'movie' ? item.title : item.mediaType === 'tv' ? item.name : '';
}

const norm = (s: string) => s.toLowerCase().trim();

/** Name comparison: case, accents and punctuation don't matter. */
const normName = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '') // strip accents (combining marks after NFD)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * Exact title matches first, then titles starting with the query, then
 * TMDB's order — so "friends" puts Friends above Thomas & Friends. Stable
 * within each tier.
 */
function rankExactFirst<T extends SearchResult>(items: T[], q: string): T[] {
  const query = norm(q);
  const tier = (item: T) => {
    const t = norm(titleOf(item));
    if (t === query) return 0;
    if (t.startsWith(query)) return 1;
    return 2;
  };
  return items
    .map((item, i) => ({ item, i, t: tier(item) }))
    .sort((a, b) => a.t - b.t || a.i - b.i)
    .map((x) => x.item);
}

/** Interleave two lists (a0, b0, a1, b1…) so mixed rows alternate types. */
function interleave<T>(a: T[], b: T[]): T[] {
  const out: T[] = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i]) out.push(a[i]);
    if (b[i]) out.push(b[i]);
  }
  return out;
}

/** People matching the query, most popular first, with what they're known for. */
async function searchPeople(q: string): Promise<SearchPerson[]> {
  try {
    const data = await search(q, { type: 'person' });
    return (data.results as PersonCard[])
      .filter((p) => (p.knownFor?.length ?? 0) > 0)
      .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
      .slice(0, PEOPLE_LIMIT)
      .map((p) => ({
        id: p.id,
        name: p.name,
        profilePath: p.profilePath,
        knownForDepartment: p.knownForDepartment,
        knownFor: (p.knownFor ?? []).slice(0, 3),
      }));
  } catch {
    return [];
  }
}

/**
 * Theme search: find a TMDB keyword matching the query ("found footage" →
 * 163053) and return titles tagged with it via /discover — the same list
 * TMDB's own keyword pages show. Null when no keyword is a close match.
 */
async function searchRelated(
  q: string,
  type: 'all' | 'movie' | 'tv',
): Promise<SearchRelated | null> {
  const query = norm(q);
  if (query.length < 3) return null;
  try {
    const data = await search(q, { type: 'keyword' });
    const keywords = (data.results as unknown as { id: number; name: string }[]).filter(
      (k) => k && typeof k.name === 'string',
    );
    const best =
      keywords.find((k) => norm(k.name) === query) ??
      keywords.find((k) => norm(k.name).includes(query) || query.includes(norm(k.name)));
    if (!best) return null;

    // No region: match TMDB's keyword page (region narrows by release date).
    const [movies, shows] = await Promise.all([
      type === 'tv'
        ? null
        : discover.movie({ keywords: [best.id] }).catch(() => null),
      type === 'movie'
        ? null
        : discover.tv({ keywords: [best.id] }).catch(() => null),
    ]);
    const items = interleave<SearchResult>(movies?.results ?? [], shows?.results ?? [])
      .filter((r) => (r.mediaType === 'movie' || r.mediaType === 'tv') && r.posterPath)
      .slice(0, RELATED_LIMIT)
      // No provider fan-out for this row — badges load on the title itself.
      .map((r) => mapToResponseItem(r, new Map()))
      .filter((r): r is SearchResponseItem => r !== null);
    if (items.length === 0) return null;

    return {
      keyword: { id: best.id, name: best.name },
      alternatives: keywords.filter((k) => k.id !== best.id).slice(0, 4),
      totalResults: (movies?.total_results ?? 0) + (shows?.total_results ?? 0),
      items,
    };
  } catch {
    return null;
  }
}

export async function searchContent(
  params: SearchParams,
  userId?: string
): Promise<SearchResponse> {
  const region =
    params.region ??
    (userId ? (await getUserRegion(userId)) ?? undefined : undefined) ??
    'US';

  const { q: rawQ = '', type = 'all', year, genre, service, page: pageStr = '1' } = params;
  const q = rawQ.trim();
  const page = Math.max(1, parseInt(pageStr, 10) || 1);
  const yearNum = year ? parseInt(year, 10) : undefined;
  const genreNum = genre ? parseInt(genre, 10) : undefined;
  // `service` is a TMDB provider id; legacy slugs ("netflix") still resolve.
  const providerId = service
    ? (SERVICE_PROVIDER_IDS[service] ?? (Number(service) > 0 ? Number(service) : undefined))
    : undefined;
  const hasFilters = Boolean(yearNum || genreNum || service);

  // ---- Text search -------------------------------------------------------
  // One TMDB page per app page (the old 3-page gather made pages overlap).
  // Filters are applied to this page's matches instead of silently dropping
  // the query: TMDB /search can't filter by genre or provider upstream.
  if (q) {
    const searchType = type === 'movie' ? 'movie' : type === 'tv' ? 'tv' : 'multi';
    const [titles, people, related] = await Promise.all([
      search(q, {
        type: searchType,
        page,
        region,
        year: searchType === 'multi' ? undefined : yearNum,
      }),
      page === 1 && type === 'all' ? searchPeople(q) : Promise.resolve(undefined),
      page === 1 ? searchRelated(q, type) : Promise.resolve(undefined),
    ]);

    // Person intent: the query IS someone's name → surface what they're in
    // (TMDB title search only matches titles, so their films never appear).
    const spotlightPerson = people?.find((p) => normName(p.name) === normName(q));
    const personSpotlight = spotlightPerson
      ? await getPersonTopCredits(spotlightPerson.id, SPOTLIGHT_CREDITS)
          .then((credits) => ({
            person: spotlightPerson,
            credits: credits.map(
              (c): SearchResponseItem => ({
                id: c.id,
                mediaType: c.mediaType,
                title: c.title,
                year: c.year ?? undefined,
                posterPath: c.posterPath,
                backdropPath: c.backdropPath,
                overview: c.overview,
                genreIds: c.genreIds,
                providerBadges: [],
              }),
            ),
          }))
          .catch(() => null)
      : null;

    let raw = titles.results.filter(
      (r) => r.mediaType === 'movie' || r.mediaType === 'tv',
    );
    if (yearNum) raw = raw.filter((r) => yearOf(r) === yearNum);
    if (genreNum) {
      raw = raw.filter(
        (r) => (r.mediaType === 'movie' || r.mediaType === 'tv') && r.genreIds?.includes(genreNum),
      );
    }
    raw = raw.filter(
      (r) =>
        r.posterPath || (r.voteCount ?? 0) >= POSTERLESS_MIN_VOTES,
    );
    if (page === 1) raw = rankExactFirst(raw, q);

    const providersMap = await fetchProvidersForResults(raw, region);
    let results = raw
      .map((item) => mapToResponseItem(item, providersMap))
      .filter((item): item is SearchResponseItem => item !== null);
    // Text searches can't filter by provider upstream, so match the badges we
    // already fetched: by provider id (TMDB badges) or by the provider's
    // catalog name (JustWatch badges carry no id).
    if (providerId) {
      const catalog = await getProvidersCatalog(region);
      const name = catalog.providers.find((p) => p.provider_id === providerId)?.provider_name;
      const wantedName = name ? cleanProviderName(name).toLowerCase() : null;
      results = results.filter((r) =>
        r.providerBadges.some(
          (p) =>
            p.provider_id === providerId ||
            (wantedName !== null && cleanProviderName(p.provider_name).toLowerCase() === wantedName),
        ),
      );
    }

    return {
      page,
      total_pages: titles.total_pages,
      // TMDB's total counts people and other types we don't list as titles.
      // When everything fits on one page we know the real number — use it.
      total_results: titles.total_pages <= 1 ? results.length : titles.total_results,
      results,
      people,
      related: related ?? null,
      personSpotlight,
      filteredWithinPage: hasFilters || undefined,
    };
  }

  let rawResults: SearchResult[] = [];
  let totalPages = 1;
  let totalResults = 0;

  if (hasFilters) {
    // ---- Filter browse (no query) via /discover --------------------------
    const filters = {
      page,
      region,
      year: yearNum,
      genre: genreNum ? [genreNum] : undefined,
      providers: providerId ? [providerId] : undefined,
    };
    const [movies, shows] = await Promise.all([
      type === 'tv' ? null : discover.movie(filters),
      type === 'movie' ? null : discover.tv(filters),
    ]);
    // "All" browses both (it used to silently fall back to movies only).
    rawResults =
      type === 'all'
        ? interleave<SearchResult>(movies?.results ?? [], shows?.results ?? []).slice(0, 20)
        : (movies ?? shows)!.results;
    totalPages = Math.max(movies?.total_pages ?? 0, shows?.total_pages ?? 0);
    totalResults = (movies?.total_results ?? 0) + (shows?.total_results ?? 0);
  } else {
    // ---- Nothing typed, no filters: popular / trending -------------------
    const data =
      type === 'movie'
        ? await movie.popular({ page, region })
        : type === 'tv'
          ? await tv.popular({ page, region })
          : await trending.all('day', { page, region });
    rawResults = data.results;
    totalPages = data.total_pages;
    totalResults = data.total_results;
  }

  const providersMap = await fetchProvidersForResults(rawResults, region);
  const results = rawResults
    .map((item) => mapToResponseItem(item, providersMap))
    .filter((item): item is SearchResponseItem => item !== null);

  return { page, total_pages: totalPages, total_results: totalResults, results };
}
