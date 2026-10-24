import 'server-only';

import { movie, tv, search } from '@/server/tmdb';
import type { MovieCard, TvCard } from '@/server/tmdb';
import { buildImageUrl } from '@/lib/tmdb';
import { ValidationAppError } from '@/utils/errors';
import { tasteSearchSchema } from './validators';

/** A title on the first-run taste step: a poster you can pick. */
export type TasteTitle = {
  key: `${'movie' | 'tv'}:${number}`;
  mediaType: 'movie' | 'tv';
  id: number;
  title: string;
  year: string | null;
  poster: string | null;
};

const fromMovie = (r: MovieCard): TasteTitle => ({
  key: `movie:${r.id}`,
  mediaType: 'movie',
  id: r.id,
  title: r.title,
  year: r.releaseDate?.slice(0, 4) || null,
  poster: buildImageUrl(r.posterPath, 'w342'),
});

const fromShow = (r: TvCard): TasteTitle => ({
  key: `tv:${r.id}`,
  mediaType: 'tv',
  id: r.id,
  title: r.name,
  year: r.firstAirDate?.slice(0, 4) || null,
  poster: buildImageUrl(r.posterPath, 'w342'),
});

/**
 * The curated row under the taste search: well-loved films and shows beside
 * what's popular, interleaved so it never opens as a wall of this week's
 * releases. Vote floors keep barely-rated new titles out of the "loved"
 * lanes. Search is the main way in; this row is for people who can't name
 * three titles on the spot.
 */
export async function getTasteRow(region: string | null): Promise<TasteTitle[]> {
  const r = region ?? undefined;
  const [classics, classics2, popular, tvTop, tvPopular] = await Promise.all([
    movie.topRated({ page: 1, region: r }).catch(() => null),
    movie.topRated({ page: 3, region: r }).catch(() => null),
    movie.popular({ page: 1, region: r }).catch(() => null),
    tv.topRated({ page: 1, region: r }).catch(() => null),
    tv.popular({ page: 1, region: r }).catch(() => null),
  ]);
  const films = (list: typeof classics, minVotes: number) =>
    (list?.results ?? []).filter((m) => m.posterPath && (m.voteCount ?? 0) >= minVotes).map(fromMovie);
  const shows = (list: typeof tvTop, minVotes: number) =>
    (list?.results ?? []).filter((s) => s.posterPath && (s.voteCount ?? 0) >= minVotes).map(fromShow);
  const lanes = [films(classics, 4000), films(popular, 400), shows(tvTop, 1500), films(classics2, 3000), shows(tvPopular, 300)];

  const seen = new Set<string>();
  const out: TasteTitle[] = [];
  for (let i = 0; out.length < 24 && i < 20; i++) {
    for (const lane of lanes) {
      const t = lane[i];
      if (t && !seen.has(t.key) && out.length < 24) {
        seen.add(t.key);
        out.push(t);
      }
    }
  }
  return out;
}

/**
 * TMDB search for the taste step: films and shows in parallel, interleaved.
 * Errors are swallowed per side so a TMDB hiccup on one still returns the
 * other; an empty query returns nothing (the client shows the curated row).
 */
export async function searchTasteTitles(query: string, region: string | null): Promise<TasteTitle[]> {
  const q = query.trim();
  if (!q) return [];
  const [movieResults, tvResults] = await Promise.all([
    search(q, { type: 'movie', region: region ?? undefined }).catch(() => ({ results: [] })),
    search(q, { type: 'tv', region: region ?? undefined }).catch(() => ({ results: [] })),
  ]);
  // search() returns a union; we asked for one type per call.
  const films = (movieResults.results as MovieCard[]).filter((m) => m.posterPath).map(fromMovie);
  const shows = (tvResults.results as TvCard[]).filter((s) => s.posterPath).map(fromShow);

  const out: TasteTitle[] = [];
  for (let i = 0; i < Math.max(films.length, shows.length) && out.length < 18; i++) {
    if (films[i]) out.push(films[i]);
    if (shows[i] && out.length < 18) out.push(shows[i]);
  }
  return out;
}

/** Taste search from raw query params (the public route's entry point). */
export async function searchTaste(input: { q: string | null; region: string | null }): Promise<TasteTitle[]> {
  const parsed = tasteSearchSchema.safeParse(input);
  if (!parsed.success) throw new ValidationAppError('Invalid search', parsed.error.flatten());
  return searchTasteTitles(parsed.data.q, parsed.data.region);
}
