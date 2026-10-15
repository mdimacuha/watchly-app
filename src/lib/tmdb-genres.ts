export const GENRE_MAP: Record<number, string> = {
  28: "Action",
  12: "Adventure",
  16: "Animation",
  35: "Comedy",
  80: "Crime",
  99: "Documentary",
  18: "Drama",
  10751: "Family",
  14: "Fantasy",
  36: "History",
  27: "Horror",
  10402: "Music",
  9648: "Mystery",
  10749: "Romance",
  878: "Science Fiction",
  10770: "TV Movie",
  53: "Thriller",
  10752: "War",
  37: "Western",
};

export function getGenreName(id: number): string {
  return GENRE_MAP[id] || "Unknown";
}

// Reverse lookup: genre display name -> TMDB id. Built once from GENRE_MAP and
// keyed by lowercased name so callers can pass display names (e.g. from a taste
// profile) without worrying about exact casing.
const GENRE_ID_BY_NAME: Record<string, number> = Object.fromEntries(
  Object.entries(GENRE_MAP).map(([id, name]) => [name.toLowerCase(), Number(id)]),
);

// Returns the TMDB genre id for a display name, or undefined when the name
// isn't one of the known movie genres (e.g. TV-only genres like
// "Sci-Fi & Fantasy" that the search genre filter doesn't support).
export function getGenreId(name: string): number | undefined {
  return GENRE_ID_BY_NAME[name.trim().toLowerCase()];
}
