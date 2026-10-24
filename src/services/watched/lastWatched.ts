import 'server-only';

import { tmdbFetch } from '@/server/tmdb/client';
import type { WatchedEntry } from './index';

/** The profile's second ticket: the most recently logged watch. */
export interface LastWatchedTicket {
  mediaType: 'movie' | 'tv';
  tmdbId: number;
  title: string;
  year: string | null;
  posterPath: string | null;
  backdropPath: string | null;
  /** Minutes: a film's runtime; for a series, a typical episode (often unknown). */
  runtime: number | null;
  /** ISO; when it was logged in Watchly. Formatted on the client, in the viewer's time. */
  loggedAt: string;
  /** YYYY-MM-DD when the member set the day they saw it by hand; else null. */
  seenOn: string | null;
}

/**
 * Picks the latest *logged* entry (not the latest seen date: a backdated log
 * is still the newest ticket) and attaches its TMDB title, art and runtime.
 * One cached TMDB read. Null when nothing has been logged or TMDB fails.
 */
export async function getLastWatchedTicket(entries: WatchedEntry[]): Promise<LastWatchedTicket | null> {
  const last = entries.reduce<WatchedEntry | null>((best, e) => (!best || e.loggedAt > best.loggedAt ? e : best), null);
  if (!last) return null;
  const id = Number(last.mediaId);
  if (!Number.isFinite(id)) return null;
  try {
    const raw = await tmdbFetch<{
      title?: string;
      name?: string;
      release_date?: string;
      first_air_date?: string;
      poster_path?: string | null;
      backdrop_path?: string | null;
      runtime?: number | null;
      episode_run_time?: number[];
    }>(`/${last.mediaType}/${id}`);
    const date = last.mediaType === 'movie' ? raw.release_date : raw.first_air_date;
    const runtime = last.mediaType === 'movie' ? raw.runtime : raw.episode_run_time?.[0];
    return {
      mediaType: last.mediaType,
      tmdbId: id,
      title: raw.title ?? raw.name ?? 'Untitled',
      year: date ? date.slice(0, 4) : null,
      posterPath: raw.poster_path ?? null,
      backdropPath: raw.backdrop_path ?? null,
      runtime: runtime && runtime > 0 ? runtime : null,
      loggedAt: last.loggedAt.toISOString(),
      seenOn: last.confirmed && last.precision === 'day' ? last.watchedAt.toISOString().slice(0, 10) : null,
    };
  } catch {
    return null;
  }
}
