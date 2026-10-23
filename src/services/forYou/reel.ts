import 'server-only';

import { and, eq, gte, max, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { forYouEvents } from '@/db/schema';
import {
  genre,
  movie,
  trending,
  tv,
  type MovieCard,
  type SearchResult,
  type TmdbImage,
  type TmdbVideo,
  type TvCard,
} from '@/server/tmdb';
import { mapWithConcurrency } from '@/lib/concurrency';
import { DECIDED_SWIPE_ACTIONS, getSwipeDeck, getSwipeKeySet } from '@/services/swipe';
import { loadExcludeSet } from '@/services/forYou';
import { ValidationAppError } from '@/utils/errors';

/**
 * The For You reel: a vertical feed of trailers that shouldn't run out or
 * repeat. Every page mixes three pools in a fixed slot pattern:
 *   - personal: the Swipe deck's picks, drawn with weighted randomness;
 *   - today: what's trending today;
 *   - wildcard: trending this week, a random page of top rated, or a deep
 *     cut from popular.
 * Each visit has its own seed, so a refresh opens on a new mix. Titles the
 * reel showed in the last 7 days stay out (today's hits only 2 days), as do
 * decided and saved titles. A skip only rests a title; it's never a dislike.
 */

export type ReelBucket = 'personal' | 'today' | 'wildcard';

export interface ReelVideo {
  key: string;
  /** TMDB video type: Trailer, Teaser, Clip, Featurette, ... */
  type: string;
}

export interface ReelItem {
  key: string;
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  title: string;
  overview: string | null;
  year: number | null;
  voteAverage: number | null;
  genres: string[];
  posterPath: string | null;
  backdropPath: string | null;
  reason: string;
  /** Which pool it came from (for the label and analytics). */
  bucket: ReelBucket;
  video: ReelVideo;
  /** Up to 8 textless backdrops for the blurred surround. */
  photos: string[];
}

/** Titles per page, by slot: never opens on a wildcard. */
const PATTERN: ReelBucket[] = ['personal', 'today', 'personal', 'wildcard', 'personal', 'today', 'personal', 'wildcard'];
/** Where an empty slot borrows from, in order. */
const BORROW: Record<ReelBucket, ReelBucket[]> = {
  personal: ['today', 'wildcard'],
  today: ['personal', 'wildcard'],
  wildcard: ['today', 'personal'],
};
/** Video lookups per bucket per round: the slots plus room for titles without a video. */
const LOOKUPS: Record<ReelBucket, number> = { personal: 6, today: 3, wildcard: 4 };
/** Deck candidates considered per page. */
const CANDIDATES = 40;
/** Personal picks are drawn from this many of the deck's best. */
const PERSONAL_TOP = 30;

const LABEL = { today: 'Popular today', wildcard: 'Something different' } as const;

const DAY_MS = 24 * 60 * 60 * 1000;
/** A title the reel showed rests this long… */
const REST_MS = 7 * DAY_MS;
/** …except today's hits, which can come back sooner. */
const TODAY_REST_MS = 2 * DAY_MS;

/** A non-personal title needs this many votes, so the random pages stay watchable. */
const MIN_VOTES = 50;

const TYPE_RANK = ['Trailer', 'Teaser', 'Clip', 'Featurette', 'Behind the Scenes', 'Opening Credits'];

const inputSchema = z.object({
  /** This visit's seed: same seed, same order; a refresh brings a new one. */
  seed: z.string().max(64).optional(),
  /** Pages this visit has already loaded (varies the wildcard sources). */
  page: z.number().int().min(0).max(500).default(0),
  /** "movie:1" keys this visit has already shown. */
  exclude: z.array(z.string().max(32)).max(500).default([]),
  /** Reasons of the last few titles shown; they go to the back of the line. */
  recentReasons: z.array(z.string().max(200)).max(12).default([]),
});

interface Candidate {
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  title: string;
  overview: string | null;
  year: number | null;
  voteAverage: number | null;
  genres: string[];
  posterPath: string | null;
  backdropPath: string | null;
  reason: string;
  bucket: ReelBucket;
}

export async function getReelPage(userId: string, input: unknown = {}): Promise<{ items: ReelItem[] }> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) throw new ValidationAppError('Invalid reel request', parsed.error.flatten());
  const { page, exclude, recentReasons } = parsed.data;
  const seed = parsed.data.seed ?? crypto.randomUUID();
  const rng = seeded(`${userId}:${seed}`);

  const rested = await recentlyShown(userId);
  const now = Date.now();
  const restingFor = (ms: number) => [...rested].filter(([, at]) => now - at < ms).map(([k]) => k);
  const shown = new Set([...exclude, ...restingFor(REST_MS)]);

  const [deck, decided, saved, genres, today, wildcard] = await Promise.all([
    getSwipeDeck(userId, { limit: CANDIDATES, exclude: shown, wildcards: false }),
    getSwipeKeySet(userId, DECIDED_SWIPE_ACTIONS),
    loadExcludeSet(userId),
    genreNames(),
    todayPool(),
    wildcardPool(seeded(`${userId}:${seed}:${page}`)),
  ]);

  // Personal: weighted random from the deck's best (strong matches still
  // tend to lead), then spread so one loved title can't fill the page.
  const personal = spreadByReason(
    weightedShuffle(deck.items.slice(0, PERSONAL_TOP), rng).map(
      (i): Candidate => ({
        tmdbId: i.tmdbId,
        mediaType: i.mediaType,
        title: i.title,
        overview: i.overview,
        year: i.year,
        voteAverage: i.voteAverage,
        genres: i.genres.map((g) => g.name),
        posterPath: i.posterPath,
        backdropPath: i.backdropPath,
        reason: i.reason,
        bucket: 'personal',
      }),
    ),
    new Set(recentReasons),
  );

  // Today and wildcards share one rule set; today's hits rest for less time.
  const taken = new Set([...decided, ...saved, ...exclude, ...personal.map(keyOf)]);
  const todayResting = new Set(restingFor(TODAY_REST_MS));
  const pick = (cards: (MovieCard | TvCard)[], bucket: 'today' | 'wildcard', resting: Set<string>) => {
    const out: Candidate[] = [];
    for (const c of cards) {
      const key = keyOf({ mediaType: c.mediaType, tmdbId: c.id });
      if (taken.has(key) || resting.has(key) || !c.posterPath || (c.voteCount ?? 0) < MIN_VOTES) continue;
      taken.add(key);
      out.push(fromCard(c, bucket, genres));
    }
    return out;
  };
  const queues: Record<ReelBucket, Candidate[]> = {
    personal,
    today: pick(weightedShuffle(today, rng), 'today', todayResting),
    wildcard: pick(shuffle(wildcard, rng), 'wildcard', shown),
  };

  // Look up videos for the head of every queue, then fill the slots. A
  // second round tops up when too many titles had no video.
  const got: Record<ReelBucket, ReelItem[]> = { personal: [], today: [], wildcard: [] };
  for (let round = 0; round < 2; round++) {
    const batch = (Object.keys(queues) as ReelBucket[]).flatMap((b) => queues[b].splice(0, LOOKUPS[b]));
    if (batch.length === 0) break;
    const found = await mapWithConcurrency(batch, batch.length, toReelItem);
    for (const it of found) if (it) got[it.bucket].push(it);
    if (Object.values(got).reduce((n, l) => n + l.length, 0) >= PATTERN.length) break;
  }

  const items: ReelItem[] = [];
  for (const slot of PATTERN) {
    const from = [slot, ...BORROW[slot]].find((b) => got[b].length > 0);
    if (from) items.push(got[from].shift()!);
  }
  return { items };
}

const keyOf = (i: { mediaType: string; tmdbId: number }) => `${i.mediaType}:${i.tmdbId}`;

/** Titles the reel showed this user in the last 7 days, with when. */
async function recentlyShown(userId: string): Promise<Map<string, number>> {
  const rows = await db
    .select({ titleKey: forYouEvents.titleKey, at: max(forYouEvents.createdAt) })
    .from(forYouEvents)
    .where(
      and(
        eq(forYouEvents.userId, userId),
        eq(forYouEvents.event, 'item_viewed'),
        gte(forYouEvents.createdAt, new Date(Date.now() - REST_MS)),
        sql`${forYouEvents.metadata}->>'surface' = 'reel'`,
      ),
    )
    .groupBy(forYouEvents.titleKey)
    .limit(1000);
  const out = new Map<string, number>();
  for (const r of rows) if (r.titleKey && r.at) out.set(r.titleKey, r.at.getTime());
  return out;
}

/** Trending today, movies and shows (shared and cached for an hour). */
async function todayPool(): Promise<(MovieCard | TvCard)[]> {
  const pages = await Promise.all(
    [1, 2, 3].map((page) => trending.all('day', { page }).catch(() => ({ results: [] as SearchResult[] }))),
  );
  return pages.flatMap((p) => p.results.filter(isTitle));
}

/**
 * This page's wildcards from three random sources: a page of this week's
 * trending, a page of top rated, and a deeper page of popular.
 */
async function wildcardPool(rng: () => number): Promise<(MovieCard | TvCard)[]> {
  const api = () => (rng() < 0.5 ? movie : tv);
  const between = (lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));
  const sources = [
    trending.all('week', { page: between(1, 5) }).then((r) => r.results.filter(isTitle)),
    api().topRated({ page: between(1, 20) }).then((r) => r.results),
    api().popular({ page: between(3, 10) }).then((r) => r.results),
  ];
  const lists = await Promise.all(sources.map((s) => s.catch(() => [] as (MovieCard | TvCard)[])));
  return lists.flat();
}

function isTitle(r: SearchResult): r is MovieCard | TvCard {
  return r.mediaType === 'movie' || r.mediaType === 'tv';
}

/** Genre id → name for movies and shows. */
async function genreNames(): Promise<Map<number, string>> {
  const [m, t] = await Promise.all([
    genre.movieList().catch(() => ({ genres: [] })),
    genre.tvList().catch(() => ({ genres: [] })),
  ]);
  return new Map([...m.genres, ...t.genres].map((g) => [g.id, g.name]));
}

function fromCard(c: MovieCard | TvCard, bucket: 'today' | 'wildcard', genres: Map<number, string>): Candidate {
  const date = c.mediaType === 'movie' ? c.releaseDate : c.firstAirDate;
  return {
    tmdbId: c.id,
    mediaType: c.mediaType,
    title: c.mediaType === 'movie' ? c.title : c.name,
    overview: c.overview || null,
    year: date ? Number(date.slice(0, 4)) || null : null,
    voteAverage: c.voteAverage || null,
    genres: (c.genreIds ?? []).map((id) => genres.get(id)).filter((g): g is string => !!g),
    posterPath: c.posterPath,
    backdropPath: c.backdropPath,
    reason: LABEL[bucket],
    bucket,
  };
}

// ---------------------------------------------------------------------------
// Seeded randomness
// ---------------------------------------------------------------------------

/** A repeatable random stream from text (FNV-1a hash into mulberry32). */
function seeded(text: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], rng: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Random order that still favours the front of the list (weight 1 / (rank + 3)). */
function weightedShuffle<T>(items: T[], rng: () => number): T[] {
  return items
    .map((it, rank) => ({ it, k: -Math.log(1 - rng()) * (rank + 3) }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.it);
}

/**
 * Round-robin across reasons ("Because you liked X", ...) so one loved
 * title can't fill the reel. Within a reason the incoming order is kept;
 * reasons shown most recently start at the back.
 */
export function spreadByReason<T extends { reason: string }>(items: T[], recent: Set<string>): T[] {
  const groups = new Map<string, T[]>();
  for (const it of items) {
    const g = groups.get(it.reason);
    if (g) g.push(it);
    else groups.set(it.reason, [it]);
  }
  const queue = [...groups.keys()].sort((a, b) => Number(recent.has(a)) - Number(recent.has(b)));
  const out: T[] = [];
  while (queue.length) {
    for (let i = 0; i < queue.length; i++) {
      const g = groups.get(queue[i])!;
      out.push(g.shift()!);
      if (g.length === 0) queue.splice(i--, 1);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Video + stills
// ---------------------------------------------------------------------------

async function toReelItem(c: Candidate): Promise<ReelItem | null> {
  const api = c.mediaType === 'movie' ? movie : tv;
  const [videos, images] = await Promise.all([
    api.videos(c.tmdbId).catch(() => null),
    // Text-free and English art only: the full set runs to hundreds of KB,
    // and every byte is a Data Cache write.
    api.images(c.tmdbId, 'null,en').catch(() => null),
  ]);
  const video = videos ? pickVideo(videos.results) : null;
  // No playable video, no place in the reel.
  if (!video) return null;
  return { ...c, key: keyOf(c), video, photos: pickPhotos(images?.backdrops ?? [], c.backdropPath) };
}

/** Best YouTube video: official Trailer > Trailer > Teaser > Clip > ... */
function pickVideo(videos: TmdbVideo[]): ReelVideo | null {
  const rank = (v: TmdbVideo) => {
    const i = TYPE_RANK.indexOf(v.type);
    return (i === -1 ? TYPE_RANK.length : i) * 2 + (v.official ? 0 : 1);
  };
  const best = videos.filter((v) => v.site === 'YouTube' && v.key).sort((a, b) => rank(a) - rank(b))[0];
  return best ? { key: best.key, type: best.type } : null;
}

/** Up to 8 backdrops, textless first, best voted first. */
function pickPhotos(backdrops: TmdbImage[], fallback: string | null): string[] {
  const sorted = [...backdrops].sort(
    (a, b) => Number(a.iso_639_1 !== null) - Number(b.iso_639_1 !== null) || b.vote_average - a.vote_average,
  );
  const paths = sorted.slice(0, 8).map((b) => b.file_path);
  return paths.length ? paths : fallback ? [fallback] : [];
}
