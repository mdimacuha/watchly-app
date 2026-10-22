'use client';

/**
 * Titles this browser opened recently, newest first (the sidebar's Tonight
 * ticket falls back to them). Kept on the device only: private by default and no
 * server query on every page. The provider is the one shown when the title
 * page loaded, stamped with when, so the sidebar never looks it up again.
 * Storage can be blocked; the list is then empty, never an error.
 */

export interface RecentTitle {
  key: string;
  mediaType: 'movie' | 'tv';
  id: string;
  title: string;
  posterPath: string | null;
  /** Wide still for card backgrounds (older entries may lack it). */
  backdropPath?: string | null;
  /** Streaming service in the user's region when last opened, if any. */
  provider: { name: string; logoPath: string | null; access: 'stream' | 'rent' | 'buy' } | null;
  openedAt: number;
}

const KEY = 'watchly.recentTitles.v1';
const LIMIT = 8;
const EMPTY: RecentTitle[] = [];

const listeners = new Set<() => void>();
let cache: RecentTitle[] | null = null;

function read(): RecentTitle[] {
  if (cache) return cache;
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    cache = Array.isArray(parsed) ? (parsed as RecentTitle[]) : EMPTY;
  } catch {
    cache = EMPTY;
  }
  return cache;
}

export function recordRecentTitle(t: Omit<RecentTitle, 'key' | 'openedAt'>) {
  const key = `${t.mediaType}:${t.id}`;
  const next = [{ ...t, key, openedAt: Date.now() }, ...read().filter((r) => r.key !== key)].slice(0, LIMIT);
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Kept for this visit only.
  }
  listeners.forEach((l) => l());
}

export const recentTitles = {
  subscribe(cb: () => void) {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
  get: read,
  getServer: () => EMPTY,
};
