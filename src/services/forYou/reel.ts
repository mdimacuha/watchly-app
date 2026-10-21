import 'server-only';

import { z } from 'zod';
import { movie, tv, type TmdbImage, type TmdbVideo } from '@/server/tmdb';
import { mapWithConcurrency } from '@/lib/concurrency';
import { getSwipeDeck, type SwipeDeckItem } from '@/services/swipe';
import { ValidationAppError } from '@/utils/errors';

/**
 * The For You reel: a vertical feed of trailers. Candidates come from the
 * Swipe deck (personal picks + popular top-up + wildcards, decided titles
 * excluded); this layer spreads them across different reasons, keeps only
 * titles with a playable YouTube video, and attaches stills for the
 * blurred surround.
 */

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
  video: ReelVideo;
  /** Up to 8 textless backdrops for the blurred surround. */
  photos: string[];
}

/** Titles per page. */
const PAGE = 8;
/** Deck candidates considered per page (variety needs more than a page). */
const CANDIDATES = 40;
/** Video lookups per page: a page plus room for titles without a video. */
const LOOKUPS = PAGE + 6;

const TYPE_RANK = ['Trailer', 'Teaser', 'Clip', 'Featurette', 'Behind the Scenes', 'Opening Credits'];

const inputSchema = z.object({
  /** "movie:1" keys this session has already shown. */
  exclude: z.array(z.string().max(32)).max(500).default([]),
  /** Reasons of the last few titles shown; they go to the back of the line. */
  recentReasons: z.array(z.string().max(200)).max(12).default([]),
});

export async function getReelPage(userId: string, input: unknown = {}): Promise<{ items: ReelItem[] }> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) throw new ValidationAppError('Invalid reel request', parsed.error.flatten());
  const { exclude, recentReasons } = parsed.data;
  const seen = new Set(exclude);

  const { items } = await getSwipeDeck(userId, { limit: CANDIDATES });
  const fresh = items.filter((i) => !seen.has(keyOf(i)));
  const ordered = spreadByReason(fresh, new Set(recentReasons));

  const withVideo = await mapWithConcurrency(ordered.slice(0, LOOKUPS), LOOKUPS, toReelItem);
  return { items: withVideo.filter((x): x is ReelItem => x !== null).slice(0, PAGE) };
}

const keyOf = (i: { mediaType: string; tmdbId: number }) => `${i.mediaType}:${i.tmdbId}`;

/**
 * Round-robin across reasons ("Because you liked X", wildcards, popular) so
 * one loved title can't fill the reel. Within a reason the deck's score
 * order is kept; reasons shown most recently start at the back.
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

async function toReelItem(i: SwipeDeckItem): Promise<ReelItem | null> {
  const api = i.mediaType === 'movie' ? movie : tv;
  const [videos, images] = await Promise.all([
    api.videos(i.tmdbId).catch(() => null),
    api.images(i.tmdbId).catch(() => null),
  ]);
  const video = videos ? pickVideo(videos.results) : null;
  // No playable video, no place in the reel.
  if (!video) return null;
  return {
    key: keyOf(i),
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
    video,
    photos: pickPhotos(images?.backdrops ?? [], i.backdropPath),
  };
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
