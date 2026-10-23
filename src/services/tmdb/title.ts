import { tmdbFetch } from "@/server/tmdb/client";
import { TmdbVideo, Genre } from "@/server/tmdb/types";
import { getJustWatchOffers } from "@/services/justwatch";
import { fallbackRegionsFor } from "@/lib/regions/nearby";

export type MediaType = "movie" | "tv";

export interface Provider {
  provider_id: number;
  provider_name: string;
  logo_path: string | null;
  display_priority?: number;
}

export interface TitleDetailsLite {
  title: string;
  year: string | null;
  overview: string;
  runtimeMinutes: number | null;
  genres: Genre[];
  posterPath: string | null;
  backdropPath: string | null;
}

export interface CastMember {
  id: number;
  name: string;
  character: string | null;
  profilePath: string | null;
  order: number | null;
}

export interface CrewMember {
  id: number;
  name: string;
  job: string;
  department: string;
  profilePath: string | null;
}

export interface StudioTag {
  id: number;
  name: string;
}

export interface CountryTag {
  code: string;
  name?: string;
}

export interface ReleaseRow {
  date: string;
  countryCode: string;
  label?: string | null;
  certification?: string | null;
  sortKey: number;
}

export interface CrewPerson {
  id: number;
  name: string;
}

export interface KeyCrew {
  /** TV only (TMDB created_by). */
  creators: CrewPerson[];
  directors: CrewPerson[];
  writers: CrewPerson[];
  producers: CrewPerson[];
}

export interface TitleInfoPanelData {
  studios: StudioTag[];
  /** Key people, each list deduped and capped. Empty lists = not on TMDB. */
  keyCrew: KeyCrew;
  countries: CountryTag[];
  primaryLanguage: string | null;
  spokenLanguages: string[];
  alternativeTitles: string[];
}


export interface TitlePagePayload {
  mediaType: MediaType;
  id: string;
  region: string;
  details: TitleDetailsLite;
  contentRating: string | null;
  collection: {
    id: number;
    name: string;
    posterPath: string | null;
    backdropPath: string | null;
  } | null;
  tvSeasons: {
    seriesId: number;
    seasons: {
      seasonNumber: number;
      name: string;
      episodeCount: number | null;
      posterPath: string | null;
      airDate: string | null;
      overview: string | null;
    }[];
  } | null;
  credits: { cast: CastMember[]; crew: CrewMember[] } | null;
  cast: CastMember[]; // Top cast slice
  trailer: TmdbVideo | null;
  providers: {
    streaming: Provider[];
    rent: Provider[];
    buy: Provider[];
  };
  providerSourceNote:
    | "region_missing"
    | "no_providers"
    | "ok"
    | "fallback_justwatch"
    | "fallback_region";
  /** Set only when providerSourceNote === "fallback_justwatch". */
  justWatchUrl?: string | null;
  /**
   * Set only when providerSourceNote === "fallback_region" — the region whose
   * TMDB data we're showing in place of the user's missing region (e.g. "US").
   */
  fallbackRegion?: string | null;
  infoPanelData: TitleInfoPanelData;
  releases: ReleaseRow[];
  extras: TitleExtras;
}

export interface TitleImage {
  filePath: string;
  width: number;
  height: number;
}

export interface RelatedTitle {
  id: number;
  mediaType: MediaType;
  title: string;
  year: string | null;
  posterPath: string | null;
}

/** Region-agnostic extras for the revamped title page (ISR-safe). */
export interface TitleExtras {
  /** TMDB status, e.g. "Released", "Post Production", "Returning Series". */
  status: string | null;
  popularity: number | null;
  externalLinks: { label: string; url: string }[];
  media: {
    videos: TmdbVideo[];
    backdrops: TitleImage[];
    posters: TitleImage[];
  };
  /** TMDB recommendations and similar titles, interleaved and deduped. */
  related: RelatedTitle[];
}

// Internal types for TMDB responses
interface TmdbCredits {
  cast: {
    id: number;
    name: string;
    character?: string;
    profile_path: string | null;
    order: number;
  }[];
  crew: {
    id: number;
    name: string;
    job: string;
    department: string;
    profile_path: string | null;
  }[];
}

interface TmdbVideos {
  results: TmdbVideo[];
}

interface TmdbProductionCompany {
  id: number;
  logo_path: string | null;
  name: string;
  origin_country: string;
}

interface TmdbProductionCountry {
  iso_3166_1: string;
  name: string;
}

interface TmdbSpokenLanguage {
  english_name: string;
  iso_639_1: string;
  name: string;
}

interface TmdbMovieDetails {
  title: string;
  release_date: string;
  overview: string;
  runtime: number | null;
  genres: Genre[];
  poster_path: string | null;
  backdrop_path: string | null;
  belongs_to_collection: {
    id: number;
    name: string;
    poster_path: string | null;
    backdrop_path: string | null;
  } | null;
  credits: TmdbCredits;
  videos: TmdbVideos;
  production_companies: TmdbProductionCompany[];
  production_countries: TmdbProductionCountry[];
  spoken_languages: TmdbSpokenLanguage[];
  original_language: string;
}

interface TmdbTvDetails {
  name: string;
  created_by?: { id: number; name: string }[];
  first_air_date: string;
  overview: string;
  episode_run_time: number[];
  genres: Genre[];
  poster_path: string | null;
  backdrop_path: string | null;
  seasons: {
    air_date: string | null;
    episode_count: number;
    id: number;
    name: string;
    overview: string;
    poster_path: string | null;
    season_number: number;
    vote_average: number;
  }[];
  credits: TmdbCredits;
  videos: TmdbVideos;
  production_companies: TmdbProductionCompany[];
  origin_country: string[]; // array of ISO codes
  spoken_languages: TmdbSpokenLanguage[];
  original_language: string;
}

/** Fields both detail shapes share via append_to_response (title extras). */
interface TmdbDetailExtras {
  status?: string | null;
  popularity?: number | null;
  homepage?: string | null;
  external_ids?: Partial<
    Record<
      "imdb_id" | "wikidata_id" | "facebook_id" | "instagram_id" | "twitter_id" | "tiktok_id",
      string | null
    >
  >;
  images?: {
    backdrops: TmdbImage[];
    posters: TmdbImage[];
  };
  similar?: TmdbRecommendations;
}

interface TmdbImage {
  file_path: string;
  width: number;
  height: number;
  vote_average: number;
}

interface TmdbReleaseDates {
  results: {
    iso_3166_1: string;
    release_dates: {
      certification: string;
      release_date: string;
      type: number;
      note?: string;
    }[];
  }[];
}

interface TmdbContentRatings {
  results: {
    iso_3166_1: string;
    rating: string;
  }[];
}

interface TmdbAlternativeTitles {
  titles?: { iso_3166_1: string; title: string }[];
  results?: { iso_3166_1: string; title: string }[]; // TV uses results
}

interface TmdbProviderResult {
  link: string;
  flatrate?: Provider[];
  rent?: Provider[];
  buy?: Provider[];
}

interface TmdbWatchProviders {
  results: Record<string, TmdbProviderResult>;
}

interface TmdbRecommendation {
  id: number;
  title?: string;
  name?: string; // for TV
  backdrop_path: string | null;
  poster_path?: string | null;
  release_date?: string;
  first_air_date?: string;
  media_type?: string;
  overview: string;
}

interface TmdbRecommendations {
  results: TmdbRecommendation[];
}

// Shared helpers for the three-tier provider fallback in getTitlePagePayload.

function processProviders(list: Provider[] = []): Provider[] {
  const uniqueMap = new Map<string, Provider>();
  list.forEach((p) => {
    let name = p.provider_name;
    // Inline normalization kept in sync with utils/providers.cleanProviderName
    // — that helper is the long-term home; this is a narrower legacy set.
    name = name.replace(/\s+Amazon\s+Channel$/i, "");
    if (name === "Amazon Prime Video") name = "Prime Video";
    if (name === "Apple TV Plus") name = "Apple TV+";
    if (name === "Google Play Movies") name = "Google Play";
    if (name === "YouTube Premium") name = "YouTube";

    // Spread preserves `logo_path` (and `display_priority`) from TMDB so the UI
    // can render branded provider logos via ProviderBadge; only the name is
    // normalized here. Keep logo_path when changing this mapping.
    const normalized = { ...p, provider_name: name };
    if (!uniqueMap.has(name)) uniqueMap.set(name, normalized);
  });

  return Array.from(uniqueMap.values()).sort(
    (a, b) => (a.display_priority || 999) - (b.display_priority || 999),
  );
}

function bucketsFor(regionProviders: TmdbProviderResult | undefined): {
  streaming: Provider[];
  rent: Provider[];
  buy: Provider[];
} {
  if (!regionProviders) {
    return { streaming: [], rent: [], buy: [] };
  }
  return {
    streaming: processProviders(regionProviders.flatrate),
    rent: processProviders(regionProviders.rent),
    buy: processProviders(regionProviders.buy),
  };
}

function isEmpty(b: { streaming: Provider[]; rent: Provider[]; buy: Provider[] }): boolean {
  return b.streaming.length === 0 && b.rent.length === 0 && b.buy.length === 0;
}

export async function getTitlePagePayload({
  mediaType,
  id,
  region,
}: {
  mediaType: MediaType;
  id: string;
  /**
   * Omit for a REGION-AGNOSTIC payload (empty providers) — used by the ISR-
   * cached title page, which fetches region providers client-side via
   * /api/v1/titles/[mediaType]/[id]?region=. Pass a region (page API route,
   * QuickView) to get the resolved provider buckets.
   */
  region?: string;
}): Promise<TitlePagePayload> {
  const numericId = parseInt(id, 10);
  if (isNaN(numericId)) {
    throw new Error("Invalid ID");
  }

  // Define parallel fetch promises
  let detailsPromise: Promise<(TmdbMovieDetails | TmdbTvDetails) & TmdbDetailExtras>;
  let ratingPromise: Promise<string | null>;
  let releaseDatesPromise: Promise<TmdbReleaseDates | null> = Promise.resolve(null);
  let contentRatingsPromise: Promise<TmdbContentRatings | null> = Promise.resolve(null);
  // Every region's providers in one large response — only needed when a region
  // is asked for. The region-agnostic ISR render skips it, so a crawl doesn't
  // write it to the Data Cache for every title.
  const providersPromise: Promise<TmdbWatchProviders> = region
    ? tmdbFetch<TmdbWatchProviders>(`/${mediaType}/${numericId}/watch/providers`)
    : Promise.resolve({ id: numericId, results: {} } as TmdbWatchProviders);
  const altTitlesPromise: Promise<TmdbAlternativeTitles> = tmdbFetch<TmdbAlternativeTitles>(
    `/${mediaType}/${numericId}/alternative_titles`
  );
  const recommendationsPromise: Promise<TmdbRecommendations> = tmdbFetch<TmdbRecommendations>(
    `/${mediaType}/${numericId}/recommendations`
  );

  // 1. Details with credits, videos and the page extras — one request.
  // include_image_language keeps text-free stills ("null") next to English art.
  const detailParams = {
    append_to_response: "credits,videos,images,external_ids,similar",
    include_image_language: "en,null",
  };
  if (mediaType === "movie") {
    detailsPromise = tmdbFetch<TmdbMovieDetails>(`/movie/${numericId}`, detailParams);
  } else {
    detailsPromise = tmdbFetch<TmdbTvDetails>(`/tv/${numericId}`, detailParams);
  }

  // 2. Content Rating & Releases
  if (mediaType === "movie") {
    const p = tmdbFetch<TmdbReleaseDates>(`/movie/${numericId}/release_dates`);
    releaseDatesPromise = p;
    ratingPromise = p.then((data) => {
      // Prefer US certification, else best available
      const us = data.results.find((r) => r.iso_3166_1 === "US");
      if (us) {
        const cert = us.release_dates.find((d) => d.certification)?.certification;
        return cert || null;
      }
      for (const r of data.results) {
        const cert = r.release_dates.find((d) => d.certification)?.certification;
        if (cert) return cert;
      }
      return null;
    });
  } else {
    const p = tmdbFetch<TmdbContentRatings>(`/tv/${numericId}/content_ratings`);
    contentRatingsPromise = p;
    ratingPromise = p.then((data) => {
      const us = data.results.find((r) => r.iso_3166_1 === "US");
      return us?.rating || data.results[0]?.rating || null;
    });
  }

  const [
    detailsData,
    rating,
    providersData,
    releaseDatesData,
    contentRatingsData,
    altTitlesData,
    recommendationsData
  ] = await Promise.all([
    detailsPromise,
    ratingPromise,
    providersPromise,
    releaseDatesPromise,
    contentRatingsPromise,
    altTitlesPromise,
    recommendationsPromise
  ]);

  // Normalize Details
  let title: string;
  let year: string | null = null;
  let runtimeMinutes: number | null = null;
  let studios: StudioTag[] = [];
  let countries: CountryTag[] = [];
  let primaryLanguage: string | null = null;
  let spokenLanguages: string[] = [];
  
  // New fields
  let collection: TitlePagePayload["collection"] = null;
  let tvSeasons: TitlePagePayload["tvSeasons"] = null;
  let creators: CrewPerson[] = [];

  if (mediaType === "movie") {
    const d = detailsData as TmdbMovieDetails;
    title = d.title;
    if (d.release_date) {
      year = new Date(d.release_date).getFullYear().toString();
    }
    runtimeMinutes = d.runtime;
    studios = d.production_companies.map(c => ({ id: c.id, name: c.name }));
    countries = d.production_countries.map(c => ({ code: c.iso_3166_1, name: c.name }));
    primaryLanguage = d.original_language;
    spokenLanguages = d.spoken_languages.map(l => l.english_name || l.name);
    
    if (d.belongs_to_collection) {
      collection = {
        id: d.belongs_to_collection.id,
        name: d.belongs_to_collection.name,
        posterPath: d.belongs_to_collection.poster_path,
        backdropPath: d.belongs_to_collection.backdrop_path,
      };
    }
  } else {
    const d = detailsData as TmdbTvDetails;
    title = d.name;
    creators = (d.created_by ?? []).map((c) => ({ id: c.id, name: c.name }));
    if (d.first_air_date) {
      year = new Date(d.first_air_date).getFullYear().toString();
    }
    if (d.episode_run_time && d.episode_run_time.length > 0) {
      runtimeMinutes = d.episode_run_time[0];
    }
    studios = d.production_companies.map(c => ({ id: c.id, name: c.name }));
    countries = d.origin_country.map(c => ({ code: c, name: c })); // TV only gives code often
    primaryLanguage = d.original_language;
    spokenLanguages = d.spoken_languages.map(l => l.english_name || l.name);

    tvSeasons = {
      seriesId: numericId,
      seasons: d.seasons.map(s => ({
        seasonNumber: s.season_number,
        name: s.name,
        episodeCount: s.episode_count,
        posterPath: s.poster_path,
        airDate: s.air_date,
        overview: s.overview,
      })),
    };
  }

  const details: TitleDetailsLite = {
    title,
    year,
    overview: detailsData.overview,
    runtimeMinutes,
    genres: detailsData.genres,
    posterPath: detailsData.poster_path,
    backdropPath: detailsData.backdrop_path,
  };

  // Alternative Titles
  const altTitlesList = (altTitlesData.titles || altTitlesData.results || [])
    .filter(t => t.iso_3166_1 === "US" || t.iso_3166_1 === "GB") // Limit to English-ish regions
    .map(t => t.title);
  
  // keyCrew is filled in once credits are normalized below.
  const infoPanelData: Omit<TitleInfoPanelData, "keyCrew"> = {
    studios,
    countries,
    primaryLanguage,
    spokenLanguages,
    alternativeTitles: [...new Set(altTitlesList)].slice(0, 5), // Dedupe and limit
  };

  // Releases Normalization
  const releases: ReleaseRow[] = [];
  if (mediaType === "movie" && releaseDatesData) {
    releaseDatesData.results.forEach(r => {
      r.release_dates.forEach(d => {
        releases.push({
          date: d.release_date.split("T")[0],
          countryCode: r.iso_3166_1,
          label: d.note || null,
          certification: d.certification || null,
          sortKey: new Date(d.release_date).getTime(),
        });
      });
    });
  } else if (mediaType === "tv") {
    // Add global first air date
    if ((detailsData as TmdbTvDetails).first_air_date) {
      const date = (detailsData as TmdbTvDetails).first_air_date;
      releases.push({
        date,
        countryCode: "Global",
        label: "Series Premiere",
        certification: null,
        sortKey: new Date(date).getTime(),
      });
    }
    // Add content ratings as pseudo-releases
    if (contentRatingsData) {
      contentRatingsData.results.forEach(r => {
        releases.push({
          date: "N/A", // TV ratings don't have dates usually
          countryCode: r.iso_3166_1,
          label: "Content Rating",
          certification: r.rating,
          sortKey: 0,
        });
      });
    }
  }
  // Sort releases by date desc
  releases.sort((a, b) => b.sortKey - a.sortKey);



  // Normalize Credits
  const creditsRaw = detailsData.credits;
  const cast: CastMember[] = creditsRaw.cast.map((c) => ({
    id: c.id,
    name: c.name,
    character: c.character || null,
    profilePath: c.profile_path,
    order: c.order,
  }));
  const crew: CrewMember[] = creditsRaw.crew.map((c) => ({
    id: c.id,
    name: c.name,
    job: c.job,
    department: c.department,
    profilePath: c.profile_path,
  }));

  const keyCrew = buildKeyCrew(crew, creators);

  const topCast = cast
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .slice(0, 12);

  // Normalize Trailer
  const videos = detailsData.videos.results;
  let trailer: TmdbVideo | null = null;
  trailer = videos.find((v) => v.site === "YouTube" && v.type === "Trailer") || null;
  if (!trailer) {
    trailer = videos.find((v) => v.site === "YouTube" && v.type === "Teaser") || null;
  }
  if (!trailer) {
    trailer = videos.find((v) => v.site === "YouTube") || null;
  }

  // Normalize Providers — three-tier fallback:
  //   1. TMDB user region            → "ok"
  //   2. JustWatch user region       → "fallback_justwatch"  (e.g. Lost in PH → Disney+)
  //   3. TMDB nearest region, US last → "fallback_region"  (e.g. Crystal Lake in PH → Australia)
  // The UI names the fallback country so users know it isn't local data.
  // Region-specific provider selection. Skipped entirely when no region is
  // supplied (region-agnostic / ISR render) — providers are then fetched
  // client-side by region via /api/v1/titles/[mediaType]/[id]?region=. This is
  // what keeps the title page statically cacheable.
  let providerSourceNote: TitlePagePayload["providerSourceNote"] = "no_providers";
  let providers: TitlePagePayload["providers"] = {
    streaming: [],
    rent: [],
    buy: [],
  };
  let justWatchUrl: string | null = null;
  let fallbackRegion: string | null = null;

  if (region) {
    // Tier 1: TMDB user region → "ok"
    providerSourceNote = "ok";
    providers = bucketsFor(providersData.results[region]);
    if (isEmpty(providers)) {
      providerSourceNote = providersData.results[region]
        ? "no_providers"
        : "region_missing";
    }

    // Tier 2: JustWatch user region → "fallback_justwatch"
    if (isEmpty(providers)) {
      try {
        const fallback = await getJustWatchOffers({
          tmdbId: id,
          mediaType,
          title,
          year,
          region,
        });
        if (fallback) {
          providers = fallback.providers;
          providerSourceNote = "fallback_justwatch";
          justWatchUrl = fallback.justWatchUrl;
        }
      } catch (err) {
        console.warn("[tmdb/title] JustWatch fallback failed:", err);
      }
    }

    // Tier 3: nearest region with TMDB data, US last (e.g. Crystal Lake in
    // PH → Australia). TMDB returns every country in one response, so this
    // costs no extra requests. Title page + Quick View only; cards stop at 2.
    if (isEmpty(providers)) {
      for (const code of fallbackRegionsFor(region)) {
        const buckets = bucketsFor(providersData.results[code]);
        if (!isEmpty(buckets)) {
          providers = buckets;
          providerSourceNote = "fallback_region";
          fallbackRegion = code;
          break;
        }
      }
    }
  }

  return {
    mediaType,
    id,
    region: region ?? "",
    details,
    contentRating: rating,
    collection,
    tvSeasons,
    credits: { cast, crew },
    cast: topCast,
    trailer,
    providers,
    providerSourceNote,
    justWatchUrl,
    fallbackRegion,
    infoPanelData: { ...infoPanelData, keyCrew },
    releases,
    extras: buildExtras(detailsData, recommendationsData, mediaType, numericId),
  };
}

const MEDIA_LIMIT = { videos: 12, backdrops: 12, posters: 8 };
const RELATED_LIMIT = 20;

/**
 * One "you might like" list: recommendations (TMDB's watched-together
 * signal) alternated with similar (genre/keyword overlap), so neither source
 * crowds out the other. Deduped, the title itself excluded.
 */
function mergeRelated(
  recommendations: TmdbRecommendation[] | undefined,
  similar: TmdbRecommendation[] | undefined,
  mediaType: MediaType,
  selfId: number,
): RelatedTitle[] {
  const recs = toRelated(recommendations, mediaType);
  const sims = toRelated(similar, mediaType);
  const seen = new Set<string>([`${mediaType}-${selfId}`]);
  const out: RelatedTitle[] = [];
  for (let i = 0; i < Math.max(recs.length, sims.length) && out.length < RELATED_LIMIT; i++) {
    for (const t of [recs[i], sims[i]]) {
      if (!t || out.length >= RELATED_LIMIT) continue;
      const key = `${t.mediaType}-${t.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(t);
    }
  }
  return out;
}

function toRelated(list: TmdbRecommendation[] | undefined, fallbackType: MediaType): RelatedTitle[] {
  return (list ?? [])
    .filter((r) => r.poster_path)
    .map((r) => {
      const date = r.release_date || r.first_air_date;
      return {
        id: r.id,
        mediaType: r.media_type === "tv" || r.media_type === "movie" ? r.media_type : fallbackType,
        title: r.title || r.name || "Untitled",
        year: date ? date.slice(0, 4) : null,
        posterPath: r.poster_path ?? null,
      };
    });
}

function toImages(list: TmdbImage[] | undefined, limit: number): TitleImage[] {
  return (list ?? [])
    .slice()
    .sort((a, b) => b.vote_average - a.vote_average)
    .slice(0, limit)
    .map((i) => ({ filePath: i.file_path, width: i.width, height: i.height }));
}

const EXTERNAL_LINK_FORMATS: [keyof NonNullable<TmdbDetailExtras["external_ids"]>, string, (v: string) => string][] = [
  ["imdb_id", "IMDb", (v) => `https://www.imdb.com/title/${v}`],
  ["wikidata_id", "Wikidata", (v) => `https://www.wikidata.org/wiki/${v}`],
  ["instagram_id", "Instagram", (v) => `https://www.instagram.com/${v}`],
  ["twitter_id", "X", (v) => `https://x.com/${v}`],
  ["facebook_id", "Facebook", (v) => `https://www.facebook.com/${v}`],
  ["tiktok_id", "TikTok", (v) => `https://www.tiktok.com/@${v}`],
];

function buildExtras(
  d: TmdbDetailExtras & { videos: TmdbVideos },
  recommendations: TmdbRecommendations,
  mediaType: MediaType,
  numericId: number,
): TitleExtras {
  const externalLinks: TitleExtras["externalLinks"] = [];
  if (d.homepage) externalLinks.push({ label: "Official site", url: d.homepage });
  for (const [key, label, url] of EXTERNAL_LINK_FORMATS) {
    const value = d.external_ids?.[key];
    if (value) externalLinks.push({ label, url: url(value) });
  }
  externalLinks.push({ label: "TMDB", url: `https://www.themoviedb.org/${mediaType}/${numericId}` });

  return {
    status: d.status ?? null,
    popularity: d.popularity ?? null,
    externalLinks,
    media: {
      videos: d.videos.results.filter((v) => v.site === "YouTube").slice(0, MEDIA_LIMIT.videos),
      backdrops: toImages(d.images?.backdrops, MEDIA_LIMIT.backdrops),
      posters: toImages(d.images?.posters, MEDIA_LIMIT.posters),
    },
    related: mergeRelated(recommendations.results, d.similar?.results, mediaType, numericId),
  };
}

const KEY_CREW_LIMIT = 4;

/** People in `crew` matching `match`, deduped by person and capped. */
function pickCrew(crew: CrewMember[], match: (c: CrewMember) => boolean): CrewPerson[] {
  const seen = new Set<number>();
  const people: CrewPerson[] = [];
  for (const c of crew) {
    if (!match(c) || seen.has(c.id)) continue;
    seen.add(c.id);
    people.push({ id: c.id, name: c.name });
    if (people.length === KEY_CREW_LIMIT) break;
  }
  return people;
}

/**
 * Director / writer / producer lists for the Details tab. Producers prefer
 * the "Producer" credit; TV series often only list Executive Producers, so
 * fall back to those. Series-level directors are rare on TV (they're
 * per-episode), so that list is often empty there.
 */
function buildKeyCrew(crew: CrewMember[], creators: CrewPerson[]): KeyCrew {
  const producers = pickCrew(crew, (c) => c.job === "Producer");
  return {
    creators: creators.slice(0, KEY_CREW_LIMIT),
    directors: pickCrew(crew, (c) => c.job === "Director"),
    writers: pickCrew(crew, (c) => c.department === "Writing"),
    producers:
      producers.length > 0
        ? producers
        : pickCrew(crew, (c) => c.job === "Executive Producer"),
  };
}
