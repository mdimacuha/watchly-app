export interface SearchResponseItem {
  id: number;
  mediaType: "movie" | "tv";
  title: string;
  year?: string;
  posterPath: string | null;
  backdropPath: string | null;
  overview: string;
  providerBadges: {
    provider_name: string;
    logo_path: string | null;
  }[]; // Mocked for now
}

export interface SearchResponse {
  page: number;
  total_pages: number;
  total_results: number;
  results: SearchResponseItem[];
}
