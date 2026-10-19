export interface SearchResponseItem {
  id: number;
  mediaType: "movie" | "tv";
  title: string;
  year?: string;
  posterPath: string | null;
  backdropPath: string | null;
  overview: string;
  /** TMDB genre ids — lets the page derive what a search is "about". */
  genreIds?: number[];
  providerBadges: {
    provider_name: string;
    logo_path: string | null;
    provider_id?: number;
  }[];
  /**
   * True when providers were looked up for the user's region. With empty
   * `providerBadges` it means "not available in your region"; unset means
   * availability wasn't fetched (show nothing).
   */
  availabilityChecked?: true;
}

/** A person matching the query (search page "People" row). */
export interface SearchPerson {
  id: number;
  name: string;
  profilePath: string | null;
  knownForDepartment: string;
  /** Up to 3 titles they're best known for. */
  knownFor: { id: number; mediaType: "movie" | "tv"; title: string }[];
}

/**
 * Titles tagged with a TMDB keyword matching the query — e.g. "found
 * footage" → keyword 163053 → /discover?with_keywords=163053. This is how
 * theme/vibe searches reach titles whose names don't contain the words.
 */
export interface SearchRelated {
  keyword: { id: number; name: string };
  /** Other close keyword matches the user can switch to. */
  alternatives: { id: number; name: string }[];
  /** Total tagged movies + shows on TMDB. */
  totalResults: number;
  items: SearchResponseItem[];
}

export interface SearchResponse {
  page: number;
  total_pages: number;
  /**
   * Upstream (TMDB) estimate of matching titles. Approximate for text
   * searches — show it as "about N".
   */
  total_results: number;
  results: SearchResponseItem[];
  /** Page 1 of text searches only. */
  people?: SearchPerson[];
  /**
   * Page 1, when the query is a person's name (exact, ignoring case and
   * punctuation): that person plus their most notable credits, so a person
   * search answers "what are they in?".
   */
  personSpotlight?: { person: SearchPerson; credits: SearchResponseItem[] } | null;
  /** Page 1 of text searches only; null when no keyword matches the query. */
  related?: SearchRelated | null;
  /**
   * Set when a text query was combined with filters: filters are applied to
   * this page of title matches (TMDB search can't filter server-side), so a
   * page can hold fewer than 20 results.
   */
  filteredWithinPage?: boolean;
}
