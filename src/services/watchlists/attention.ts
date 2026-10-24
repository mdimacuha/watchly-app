import 'server-only';

import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { userPreferences, watchedTitles, watchlistItems, watchlists } from '@/db/schema';
import { tmdbFetch, PROVIDERS_REVALIDATE } from '@/server/tmdb/client';
import { mapWithConcurrency } from '@/lib/concurrency';
import { buildImageUrl } from '@/lib/tmdb';
import { logger } from '@/lib/log';
import { getSelectedProviders } from '@/services/preferences/forYouPrefs';
import { logWatchlistEvent } from './events';
import type { WatchlistItemStatus, WatchlistMediaType } from './validators';
import { ALERT_KINDS, type AttentionKind } from './attentionKinds';

/**
 * What in the owner's lists has changed, or contradicts their own record.
 * Every claim is checked when it's read. Kinds, strongest evidence first:
 *   seen        logged in Seen it, but the list still says it's unwatched
 *   wait_over   Waiting for Episode/Season, and one has aired since
 *   left        was streaming on one of your services at the last check, isn't now
 *   on_services not started, and streaming now on one of your services here
 *   still_on    Up Next / Watching / Paused, untouched for 90+ days
 *   dust        Just Added, untouched for 90+ days (a shelf, never a nag)
 * "Keep" (kept_at) silences a suggestion: for good on still_on / dust, and
 * until something newer happens (a new log, a new episode, another service
 * leaving) on the others. Owner-only: reads only the caller's own rows.
 */

export { ALERT_KINDS, type AttentionKind };

export interface AttentionEntry {
  /** `${kind}:${itemId}`: stable, used for the dismissal fingerprint. */
  key: string;
  kind: AttentionKind;
  itemId: string;
  watchlistId: string;
  listName: string;
  mediaType: WatchlistMediaType;
  mediaId: string;
  title: string;
  poster: string | null;
  status: WatchlistItemStatus;
  /** The fact, ready to print: "Logged 3 Oct" · "Season 2 is out · from 22 Apr" · "No longer on Netflix". */
  fact: string;
  /** A service it streams on in the member's region, when one of theirs. */
  service: { name: string; logo: string | null } | null;
}

export interface AttentionSummary {
  region: string;
  entries: AttentionEntry[];
  /** Hash of the alert entries' keys: a dismissal holds until this changes. */
  fingerprint: string;
  /** The member dismissed exactly this set. */
  dismissed: boolean;
}

type Seen = { region: string; services: { id: number; name: string }[]; gone?: { id: number; name: string; at: string }[] };

const DAY = 86_400_000;
const QUIET_DAYS = 90;
const MAX_LOOKUPS = 60;
const DETAILS_CACHE = { revalidate: 86400 } as const; // air dates and titles; a day is fresh enough
const NOT_STARTED: WatchlistItemStatus[] = ['just_added', 'up_next'];
const UNWATCHED: WatchlistItemStatus[] = ['just_added', 'up_next', 'watching', 'paused', 'waiting_for_episode', 'waiting_for_season'];

const fmtDay = (d: string | Date) => new Date(d).toLocaleDateString('en-US', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const fmtMonth = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });

interface Details {
  title?: string;
  name?: string;
  poster_path?: string | null;
  last_episode_to_air?: { air_date?: string | null; season_number?: number; episode_number?: number } | null;
  seasons?: { season_number: number; air_date: string | null }[];
}
interface Providers {
  results?: Record<string, { flatrate?: { provider_id: number; provider_name: string; logo_path: string | null }[] }>;
}

function hash(keys: string[]): string {
  let h = 5381;
  for (const ch of [...keys].sort().join('|')) h = ((h << 5) + h + ch.charCodeAt(0)) | 0;
  return (h >>> 0).toString(36);
}

export async function getAttention(userId: string, region: string, opts: { watchlistId?: string } = {}): Promise<AttentionSummary> {
  const [rows, prefs] = await Promise.all([
    db
      .select({
        itemId: watchlistItems.id,
        watchlistId: watchlists.id,
        listName: watchlists.name,
        mediaType: watchlistItems.mediaType,
        mediaId: watchlistItems.mediaId,
        status: watchlistItems.status,
        updatedAt: watchlistItems.updatedAt,
        keptAt: watchlistItems.keptAt,
        providersSeen: watchlistItems.providersSeen,
      })
      .from(watchlistItems)
      .innerJoin(watchlists, eq(watchlists.id, watchlistItems.watchlistId))
      .where(and(eq(watchlists.userId, userId), inArray(watchlistItems.status, UNWATCHED), opts.watchlistId ? eq(watchlists.id, opts.watchlistId) : undefined))
      .limit(400),
    db.select({ dismissed: userPreferences.attentionDismissed }).from(userPreferences).where(eq(userPreferences.userId, userId)).limit(1),
  ]);
  const dismissedFp = prefs[0]?.dismissed?.fingerprint ?? null;
  if (!rows.length) return { region, entries: [], fingerprint: hash([]), dismissed: false };

  const [seenRows, services] = await Promise.all([
    db
      .select({ mediaType: watchedTitles.mediaType, mediaId: watchedTitles.mediaId, watchedAt: watchedTitles.watchedAt })
      .from(watchedTitles)
      .where(and(eq(watchedTitles.userId, userId), inArray(watchedTitles.mediaId, [...new Set(rows.map((r) => r.mediaId))]))),
    getSelectedProviders(userId),
  ]);
  const seen = new Map(seenRows.map((s) => [`${s.mediaType}:${s.mediaId}`, s.watchedAt]));
  const mine = new Set(services ?? []);
  const now = Date.now();
  const quiet = (r: (typeof rows)[number]) => now - r.updatedAt.getTime() > QUIET_DAYS * DAY;
  const wantsProviders = (r: (typeof rows)[number]) => mine.size > 0 && NOT_STARTED.includes(r.status);

  // TMDB only for rows that could become an entry: titles, air dates, providers.
  const candidates = rows.filter((r) => seen.has(`${r.mediaType}:${r.mediaId}`) || r.status.startsWith('waiting') || quiet(r) || wantsProviders(r)).slice(0, MAX_LOOKUPS);
  const looked = await mapWithConcurrency(candidates, 8, async (r) => {
    const [d, p] = await Promise.all([
      tmdbFetch<Details>(`/${r.mediaType}/${r.mediaId}`, {}, { cache: DETAILS_CACHE }).catch(() => null),
      wantsProviders(r) ? tmdbFetch<Providers>(`/${r.mediaType}/${r.mediaId}/watch/providers`, {}, { cache: { revalidate: PROVIDERS_REVALIDATE } }).catch(() => null) : Promise.resolve(null),
    ]);
    return { r, d, p };
  });

  const entries: AttentionEntry[] = [];
  const snapshots: { id: string; seen: Seen }[] = [];
  const today = new Date().toISOString().slice(0, 10);

  for (const { r, d, p } of looked) {
    // Providers: keep the snapshot current, and carry forward any of the member's services that left.
    let gone: Seen['gone'] = r.providersSeen?.region === region ? (r.providersSeen.gone ?? []) : [];
    let offer: { provider_id: number; provider_name: string; logo_path: string | null } | null = null;
    const regionOffers = p?.results ? (p.results[region]?.flatrate ?? []) : null; // null = no answer, so no claim
    if (regionOffers) {
      offer = regionOffers.find((o) => mine.has(o.provider_id)) ?? null;
      const nowIds = new Set(regionOffers.map((o) => o.provider_id));
      const prev = r.providersSeen?.region === region ? r.providersSeen : null;
      const left = (prev?.services ?? []).filter((s) => mine.has(s.id) && !nowIds.has(s.id));
      gone = [...gone.filter((g) => !nowIds.has(g.id)), ...left.filter((l) => !gone!.some((g) => g.id === l.id)).map((l) => ({ ...l, at: new Date().toISOString() }))];
      const next: Seen = { region, services: regionOffers.map((o) => ({ id: o.provider_id, name: o.provider_name })), ...(gone.length && { gone }) };
      if (JSON.stringify(next) !== JSON.stringify(r.providersSeen)) snapshots.push({ id: r.itemId, seen: next });
    }

    if (!d) continue; // no title, no claim
    const base = {
      itemId: r.itemId,
      watchlistId: r.watchlistId,
      listName: r.listName,
      mediaType: r.mediaType,
      mediaId: r.mediaId,
      title: d.title ?? d.name ?? 'Untitled',
      poster: buildImageUrl(d.poster_path ?? null, 'w185'),
      status: r.status,
      service: offer ? { name: offer.provider_name, logo: buildImageUrl(offer.logo_path, 'w92') } : null,
    };
    // Kept after the fact became true = the member already answered it.
    const kept = (since: string | Date | null) => !!r.keptAt && (since === null || r.keptAt > new Date(since));
    const push = (kind: AttentionKind, fact: string) => entries.push({ ...base, key: `${kind}:${r.itemId}`, kind, fact });

    const watchedAt = seen.get(`${r.mediaType}:${r.mediaId}`);
    if (watchedAt) {
      if (!kept(watchedAt)) push('seen', `Logged ${fmtDay(watchedAt)}`);
      continue;
    }
    if (r.status === 'waiting_for_episode' || r.status === 'waiting_for_season') {
      const last = d.last_episode_to_air;
      const aired = last?.air_date ?? null;
      const since = r.updatedAt.toISOString().slice(0, 10);
      if (aired && aired > since && aired <= today) {
        const seasonStart = d.seasons?.find((s) => s.season_number === last?.season_number)?.air_date ?? null;
        if (r.status === 'waiting_for_season' && seasonStart && seasonStart > since && !kept(seasonStart)) push('wait_over', `Season ${last?.season_number} is out · from ${fmtDay(seasonStart)}`);
        else if (r.status === 'waiting_for_episode' && !kept(aired)) push('wait_over', `S${last?.season_number} E${last?.episode_number} is out · ${fmtDay(aired)}`);
      }
      continue;
    }
    const latestGone = gone?.length ? gone[gone.length - 1] : null;
    if (latestGone && !offer && !kept(latestGone.at)) {
      push('left', `No longer on ${latestGone.name}`);
      continue;
    }
    if (quiet(r)) {
      if (kept(null)) continue;
      if (r.status === 'just_added') push('dust', `Added ${fmtMonth(r.updatedAt)}`);
      else push('still_on', `${r.status === 'watching' ? 'Watching' : r.status === 'paused' ? 'Paused' : 'Up Next'} since ${fmtMonth(r.updatedAt)}`);
      continue;
    }
    if (offer) push('on_services', `On ${offer.provider_name}`);
  }

  // Snapshot writes: DB only, and only for titles whose services changed.
  if (snapshots.length) {
    const checkedAt = new Date();
    await Promise.all(snapshots.map((s) => db.update(watchlistItems).set({ providersSeen: s.seen, providersCheckedAt: checkedAt }).where(eq(watchlistItems.id, s.id)))).catch((err) =>
      logger.warn('[attention] provider snapshot write failed', { err, count: snapshots.length }),
    );
  }

  const fingerprint = hash(entries.filter((e) => ALERT_KINDS.includes(e.kind)).map((e) => e.key));
  return { region, entries, fingerprint, dismissed: fingerprint === dismissedFp };
}

/** Hide the alert until its set of things changes. */
export async function dismissAttention(userId: string, fingerprint: string): Promise<void> {
  const fp = fingerprint.slice(0, 32);
  await db.update(userPreferences).set({ attentionDismissed: { fingerprint: fp, at: new Date().toISOString() } }).where(eq(userPreferences.userId, userId));
  void logWatchlistEvent(userId, 'attention_dismissed', { fingerprint: fp });
}
