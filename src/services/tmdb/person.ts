import { tmdbFetch } from "@/server/tmdb/client";
import { TmdbVideo, Genre } from "@/server/tmdb/types";
import { getGenreName } from "@/lib/tmdb-genres";
import { z } from "zod";
import { TmdbError } from "@/server/tmdb/errors";
import { NotFoundAppError, ValidationAppError } from "@/utils/errors";
import type { BadgeTarget } from "@/services/providers/cardBadges";

export interface PersonDetails {
  id: number;
  name: string;
  biography: string;
  birthday: string | null;
  deathday: string | null;
  placeOfBirth: string | null;
  profilePath: string | null;
  knownForDepartment: string;
}

export interface Credit {
  id: number;
  /** TMDB credit_id — unique per credit (a person can hold several roles on one title). */
  creditId: string;
  title: string;
  posterPath: string | null;
  releaseDate: string | null;
  character?: string;
  job?: string;
  department?: string;
  mediaType: "movie" | "tv";
  voteAverage: number;
  genreIds: number[];
  genre: string;
}

// The order roles read in when one person holds several on a title
// ("Director, Writer, Producer"). Unlisted jobs follow, in TMDB's order.
const JOB_ORDER = [
  "Director", "Creator", "Screenplay", "Writer", "Story", "Novel", "Characters",
  "Producer", "Executive Producer", "Director of Photography", "Editor", "Original Music Composer",
];
const jobRank = (job: string | undefined) => {
  const i = JOB_ORDER.indexOf(job ?? "");
  return i === -1 ? JOB_ORDER.length : i;
};

/**
 * One card per title: TMDB lists a credit per role, so a director who also
 * wrote and produced would show the same poster three times. Roles (crew) or
 * characters (cast) are joined onto the title's first credit.
 */
function mergeCredits(list: Credit[]): Credit[] {
  const byTitle = new Map<string, Credit[]>();
  for (const c of list) {
    const key = `${c.mediaType}:${c.id}`;
    byTitle.set(key, [...(byTitle.get(key) ?? []), c]);
  }
  const unique = (xs: (string | undefined)[]) => [...new Set(xs.filter((x): x is string => Boolean(x)))];
  return [...byTitle.values()].map((group) => {
    if (group.length === 1) return group[0];
    const jobs = unique([...group].sort((a, b) => jobRank(a.job) - jobRank(b.job)).map((c) => c.job));
    const characters = unique(group.map((c) => c.character));
    return {
      ...group[0],
      job: jobs.length ? jobs.join(", ") : group[0].job,
      character: characters.length ? characters.join(" / ") : group[0].character,
    };
  });
}

export interface PersonPagePayload {
  details: PersonDetails;
  credits: {
    cast: Credit[];
    crew: Credit[];
  };
  /** Credits to badge client-side (40 most popular + 40 most recent), for the visitor's region. */
  badgeTargets: BadgeTarget[];
}

interface TmdbPersonDetails {
  id: number;
  name: string;
  biography: string;
  birthday: string | null;
  deathday: string | null;
  place_of_birth: string | null;
  profile_path: string | null;
  known_for_department: string;
}

interface TmdbCombinedCredit {
  id: number;
  credit_id: string;
  title?: string;
  name?: string;
  poster_path: string | null;
  backdrop_path?: string | null;
  overview?: string;
  release_date?: string;
  first_air_date?: string;
  character?: string;
  job?: string;
  department?: string;
  vote_average: number;
  vote_count: number;
  genre_ids: number[];
  popularity?: number;
  media_type: "movie" | "tv";
}

interface TmdbCombinedCredits {
  cast: TmdbCombinedCredit[];
  crew: TmdbCombinedCredit[];
}

/**
 * Artist page payload. Region-agnostic (the page is cached): instead of
 * badges it returns `badgeTargets` — the credits worth badging — and the page
 * loads their availability for the visitor's region client-side.
 */
export async function getPersonPagePayload(id: string): Promise<PersonPagePayload> {
  const numericId = parseInt(id, 10);
  if (isNaN(numericId)) {
    throw new Error("Invalid ID");
  }

  const [details, credits] = await Promise.all([
    tmdbFetch<TmdbPersonDetails>(`/person/${numericId}`),
    tmdbFetch<TmdbCombinedCredits>(`/person/${numericId}/combined_credits`),
  ]);

  // Identify top credits to fetch providers for
  // Strategy:
  // 1. Get top 40 most popular (hits usually have providers)
  // 2. Get top 40 most recent (what users see first in the UI sorted by date)
  // 3. Merge and dedupe
  
  const creditsList = [
    ...credits.cast.map(c => ({ ...c, creditType: 'cast' })),
    ...credits.crew.map(c => ({ ...c, creditType: 'crew' }))
  ];

  const topCredits = new Map<string, BadgeTarget>();

  const addToMap = (list: typeof creditsList) => {
    for (const credit of list) {
      if (credit.media_type === "movie" || credit.media_type === "tv") {
        const key = `${credit.media_type}:${credit.id}`;
        if (!topCredits.has(key)) {
          const date = credit.release_date || credit.first_air_date || "";
          topCredits.set(key, {
            id: credit.id,
            mediaType: credit.media_type,
            title: credit.title || credit.name || "",
            year: /^\d{4}/.test(date) ? date.slice(0, 4) : null,
          });
        }
      }
    }
  };

  // 1. Top Popular
  const byPopularity = [...creditsList].sort((a, b) => {
    if (a.popularity !== undefined && b.popularity !== undefined) {
      return b.popularity - a.popularity;
    }
    return (b.vote_count || 0) - (a.vote_count || 0);
  });
  addToMap(byPopularity.slice(0, 40));

  // 2. Most Recent (Future & Recent Past)
  const byDate = [...creditsList].sort((a, b) => {
    const dateA = new Date(a.release_date || a.first_air_date || "1900-01-01").getTime();
    const dateB = new Date(b.release_date || b.first_air_date || "1900-01-01").getTime();
    return dateB - dateA;
  });
  addToMap(byDate.slice(0, 40));

  return {
    badgeTargets: [...topCredits.values()],
    details: {
      id: details.id,
      name: details.name,
      biography: details.biography,
      birthday: details.birthday,
      deathday: details.deathday,
      placeOfBirth: details.place_of_birth,
      profilePath: details.profile_path,
      knownForDepartment: details.known_for_department,
    },
    credits: {
      cast: mergeCredits(credits.cast.map((c) => ({
        id: c.id,
        creditId: c.credit_id,
        title: c.title || c.name || "Unknown Title",
        posterPath: c.poster_path,
        releaseDate: c.release_date || c.first_air_date || null,
        character: c.character,
        mediaType: c.media_type,
        voteAverage: c.vote_average,
        genreIds: c.genre_ids ?? [],
        genre: (c.genre_ids?.length ?? 0) > 0 ? getGenreName(c.genre_ids[0]) : "Unknown",
      }))),
      crew: mergeCredits(credits.crew.map((c) => ({
        id: c.id,
        creditId: c.credit_id,
        title: c.title || c.name || "Unknown Title",
        posterPath: c.poster_path,
        releaseDate: c.release_date || c.first_air_date || null,
        job: c.job,
        department: c.department,
        mediaType: c.media_type,
        voteAverage: c.vote_average,
        genreIds: c.genre_ids ?? [],
        genre: (c.genre_ids?.length ?? 0) > 0 ? getGenreName(c.genre_ids[0]) : "Unknown",
      }))),
    },
  };
}

// ---------------------------------------------------------------------------
// Quick View — a light person preview (no per-credit provider lookups).
// ---------------------------------------------------------------------------

export interface PersonQuickViewCredit {
  id: number;
  mediaType: "movie" | "tv";
  title: string;
  character: string | null;
  year: string | null;
  posterPath: string | null;
}

export interface PersonQuickViewPayload {
  details: PersonDetails;
  /** Top acting roles, most notable first. */
  topActing: PersonQuickViewCredit[];
}

const TOP_ACTING_LIMIT = 5;
// TMDB TV genres that are appearances, not acting roles.
const NON_ACTING_GENRES = new Set([10763 /* News */, 10764 /* Reality */, 10767 /* Talk */]);
const SELF_CHARACTER = /^(self|himself|herself|themselves)\b/i;

const personIdSchema = z.coerce.number().int().positive();

export async function getPersonQuickView(id: string): Promise<PersonQuickViewPayload> {
  const parsed = personIdSchema.safeParse(id);
  if (!parsed.success) throw new ValidationAppError("Invalid person id");
  const personId = parsed.data;

  try {
    const [details, credits] = await Promise.all([
      tmdbFetch<TmdbPersonDetails>(`/person/${personId}`),
      tmdbFetch<TmdbCombinedCredits>(`/person/${personId}/combined_credits`),
    ]);

    const topActing = rankActingCredits(credits.cast)
      .slice(0, TOP_ACTING_LIMIT)
      .map((c) => ({
        id: c.id,
        mediaType: c.media_type,
        title: c.title || c.name || "Unknown Title",
        character: c.character || null,
        year: (c.release_date || c.first_air_date || "").slice(0, 4) || null,
        posterPath: c.poster_path,
      }));

    return {
      details: {
        id: details.id,
        name: details.name,
        biography: details.biography,
        birthday: details.birthday,
        deathday: details.deathday,
        placeOfBirth: details.place_of_birth,
        profilePath: details.profile_path,
        knownForDepartment: details.known_for_department,
      },
      topActing,
    };
  } catch (err) {
    if (err instanceof TmdbError && err.status === 404) {
      throw new NotFoundAppError("Person not found");
    }
    throw err;
  }
}

/**
 * Acting credits, most notable first: most-voted roles (a steadier signal
 * of notable work than TMDB popularity, which tracks current buzz), without
 * talk/news/reality appearances or "Self" roles, one entry per title.
 */
function rankActingCredits(cast: TmdbCombinedCredit[]): TmdbCombinedCredit[] {
  const seen = new Set<string>();
  return cast
    .filter(
      (c) =>
        (c.media_type === "movie" || c.media_type === "tv") &&
        !c.genre_ids?.some((g) => NON_ACTING_GENRES.has(g)) &&
        !SELF_CHARACTER.test(c.character ?? ""),
    )
    .sort((a, b) => (b.vote_count || 0) - (a.vote_count || 0))
    .filter((c) => {
      const key = `${c.media_type}:${c.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export interface PersonTopCredit {
  id: number;
  mediaType: "movie" | "tv";
  title: string;
  year: string | null;
  posterPath: string | null;
  backdropPath: string | null;
  overview: string;
  genreIds: number[];
  character: string | null;
}

/**
 * A person's most notable acting credits (with posters), for the search
 * page's "Movies & shows with <name>" section. One TMDB call (cached 1h,
 * shared with the person Quick View).
 */
export async function getPersonTopCredits(personId: number, limit: number): Promise<PersonTopCredit[]> {
  const credits = await tmdbFetch<TmdbCombinedCredits>(`/person/${personId}/combined_credits`);
  return rankActingCredits(credits.cast)
    .filter((c) => c.poster_path)
    .slice(0, limit)
    .map((c) => ({
      id: c.id,
      mediaType: c.media_type,
      title: c.title || c.name || "Unknown Title",
      year: (c.release_date || c.first_air_date || "").slice(0, 4) || null,
      posterPath: c.poster_path,
      backdropPath: c.backdrop_path ?? null,
      overview: c.overview ?? "",
      genreIds: c.genre_ids ?? [],
      character: c.character || null,
    }));
}
