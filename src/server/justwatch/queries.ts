import { justWatchFetch } from "./client";

// JustWatch is a private API — these shapes match what the public web client
// requests, kept minimal so schema drift breaks loudly.

export type JustWatchObjectType =
  | "MOVIE"
  | "SHOW"
  | "SHOW_SEASON"
  | "SHOW_EPISODE";

// ISO 3166-1 alpha-2 region code. JustWatch's `Country` scalar accepts the
// same set as TMDB's `watch/providers.results` keys.
export type Country = string;

export interface JustWatchPackage {
  clearName: string;
  shortName: string;
  technicalName: string;
  icon: string | null;
}

export interface JustWatchOffer {
  monetizationType: "FLATRATE" | "RENT" | "BUY" | "FREE" | "ADS" | string;
  presentationType: "SD" | "HD" | "_4K" | string;
  standardWebURL: string | null;
  package: JustWatchPackage;
}

export interface JustWatchContent {
  title: string;
  originalReleaseYear: number | null;
  fullPath: string;
  externalIds: {
    imdbId: string | null;
    // JustWatch returns tmdbId as a string ("4607"), not a number — match it
    // as a string to avoid silent === mismatches.
    tmdbId: string | null;
  };
}

export interface JustWatchNode {
  id: string;
  objectId: number;
  objectType: JustWatchObjectType;
  content: JustWatchContent;
  offers: JustWatchOffer[] | null;
}

// --- searchByTitle ---
// Used to find a JustWatch entry whose externalIds.tmdbId matches ours, so
// we can derive its fullPath without maintaining a TMDB→JustWatch mapping.

interface SearchVars {
  country: Country;
  language: string;
  first: number;
  platform: "WEB";
  searchTitlesFilter: {
    searchQuery: string;
    objectTypes?: JustWatchObjectType[];
  };
}

interface SearchData {
  popularTitles: {
    edges: { node: JustWatchNode }[];
  };
}

// popularTitles already narrows to MovieOrShow, so bare selections work here.
const SEARCH_QUERY = `
  query GetSearchTitles(
    $country: Country!,
    $language: Language!,
    $first: Int!,
    $searchTitlesFilter: TitleFilter,
    $platform: Platform! = WEB
  ) {
    popularTitles(country: $country, filter: $searchTitlesFilter, first: $first) {
      edges {
        node {
          id
          objectId
          objectType
          content(country: $country, language: $language) {
            title
            originalReleaseYear
            fullPath
            externalIds { imdbId tmdbId }
          }
          offers(country: $country, platform: $platform) {
            monetizationType
            presentationType
            standardWebURL
            package { clearName shortName technicalName icon }
          }
        }
      }
    }
  }
`;

export async function searchByTitle(opts: {
  query: string;
  country: Country;
  mediaType: "movie" | "tv";
  language?: string;
  first?: number;
}): Promise<JustWatchNode[]> {
  const data = await justWatchFetch<SearchVars, SearchData>({
    operationName: "GetSearchTitles",
    query: SEARCH_QUERY,
    variables: {
      country: opts.country,
      language: opts.language ?? "en",
      first: opts.first ?? 10,
      platform: "WEB",
      searchTitlesFilter: {
        searchQuery: opts.query,
        objectTypes: [opts.mediaType === "movie" ? "MOVIE" : "SHOW"],
      },
    },
  });

  return data.popularTitles.edges.map((e) => e.node);
}

// --- getOffersByPath ---
// Once we know the fullPath (from search), this fetches offers for any region.

interface OffersVars {
  fullPath: string;
  country: Country;
  language: string;
  platform: "WEB";
}

interface OffersData {
  urlV2: {
    node: JustWatchNode | null;
  } | null;
}

// urlV2.node is the `Node` interface — need an inline fragment to narrow it.
const OFFERS_QUERY = `
  query GetUrlTitleDetails(
    $fullPath: String!,
    $country: Country!,
    $language: Language!,
    $platform: Platform! = WEB
  ) {
    urlV2(fullPath: $fullPath) {
      node {
        id
        ... on MovieOrShow {
          objectId
          objectType
          content(country: $country, language: $language) {
            title
            originalReleaseYear
            fullPath
            externalIds { imdbId tmdbId }
          }
          offers(country: $country, platform: $platform) {
            monetizationType
            presentationType
            standardWebURL
            package { clearName shortName technicalName icon }
          }
        }
      }
    }
  }
`;

export async function getOffersByPath(opts: {
  fullPath: string;
  country: Country;
  language?: string;
}): Promise<JustWatchNode | null> {
  const data = await justWatchFetch<OffersVars, OffersData>({
    operationName: "GetUrlTitleDetails",
    query: OFFERS_QUERY,
    variables: {
      fullPath: opts.fullPath,
      country: opts.country,
      language: opts.language ?? "en",
      platform: "WEB",
    },
  });

  return data.urlV2?.node ?? null;
}
