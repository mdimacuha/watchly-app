import 'server-only';

import { unstable_cache } from 'next/cache';
import { and, eq, inArray, ne } from 'drizzle-orm';
import { db } from '@/db';
import { titleAlerts, watchlistItems, watchlists } from '@/db/schema';
import { tmdbFetch } from '@/server/tmdb/client';
import { mapWithConcurrency } from '@/lib/concurrency';
import { buildImageUrl } from '@/lib/tmdb';
import { logger } from '@/lib/log';
import { newFeedTag } from './cacheTag';

/**
 * New & Coming Soon: films opening or arriving in the member's country, and
 * a week of episodes for their shows (then popular ones) by channel.
 *
 * Truth rules: every film date is that country's own release date (TMDB
 * release_dates; no silent US fallback — no date, no row); "On <service>"
 * only when the country's watch providers confirm it; digital = rent or buy.
 * TV has dates only (TMDB has no air times), kept as 'YYYY-MM-DD' strings.
 * A streaming show is listed under the service that carries it in the
 * country (and left out if none does, unless it's the member's own); a
 * channel from another country is marked, because its dates are its own.
 */

export interface NewFilm {
  key: string;
  tmdbId: number;
  title: string;
  year: string | null;
  director: string | null;
  /** The country's release date, YYYY-MM-DD. */
  date: string;
  kind: 'cinema' | 'limited' | 'digital';
  /** "In cinemas" · "Limited release" · "On Netflix" · "Rent or buy". */
  where: string;
  service: string | null;
  serviceLogo: string | null;
  poster: string | null;
  backdrop: string | null;
  overview: string | null;
  /** On one of the member's watchlists. */
  pinned: boolean;
}

export interface NewEpisode {
  date: string;
  season: number;
  episode: number;
  name: string | null;
  /** Episodes on the same day for this show (a whole season dropping at once). */
  count: number;
  flag: 'premiere' | 'finale' | null;
}

export interface NewShow {
  key: string;
  tmdbId: number;
  title: string;
  poster: string | null;
  backdrop: string | null;
  /** Followed, or on one of the member's watchlists. */
  mine: boolean;
  episodes: NewEpisode[];
}

export interface NewChannel {
  key: string;
  name: string;
  logo: string | null;
  mine: boolean;
  /** A streaming service (Netflix, Max, Disney+…) rather than a broadcast network. */
  streaming: boolean;
  /** The channel's own country when it isn't the member's: its air dates are that country's. */
  elsewhere: string | null;
  shows: NewShow[];
}

export interface NewFeed {
  region: string;
  /** Today in the member's timezone, YYYY-MM-DD. */
  today: string;
  /** Today and the six days after it. */
  days: string[];
  films: NewFilm[];
  channels: NewChannel[];
  hasShows: boolean;
}

const DETAIL_CACHE = { revalidate: 21600 } as const; // 6h: next episodes change on air days
const MY_SHOWS_MAX = 30;
const POPULAR_SHOWS_MAX = 30;
const FILMS_MAX = 24;
const FILMS_BUFFER = 8; // shared extras, so taking out the member's own films leaves the board full
const CHANNELS_MAX = 14;
// TMDB network ids of the big streamers, for their originals this week.
const STREAMING_NETWORKS = [213 /* Netflix */, 49 /* HBO */, 3186 /* Max */, 2739 /* Disney+ */, 2552 /* Apple TV+ */, 1024 /* Prime Video */, 453 /* Hulu */, 4330 /* Paramount+ */, 3353 /* Peacock */];
const STREAMING_IDS = new Set(STREAMING_NETWORKS);
const STREAMING_SHOWS_MAX = 40; // candidates; the ones not streaming in the country drop out
// Talk, news, reality, soap and kids: nightly/daily filler that would fill a
// popular guide with noise. Never filtered from the member's own shows.
const FILLER_GENRES = new Set([10767, 10763, 10764, 10766, 10762]);

/** YYYY-MM-DD in a timezone. */
export function dayIn(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

/** Adds days to a YYYY-MM-DD string (calendar arithmetic, no timezone). */
function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Films
// ---------------------------------------------------------------------------

interface DiscoverPage {
  results: { id: number }[];
}

interface MovieDetail {
  id: number;
  title: string;
  release_date?: string;
  overview?: string;
  poster_path: string | null;
  backdrop_path: string | null;
  credits?: { crew?: { job: string; name: string }[] };
  release_dates?: { results: { iso_3166_1: string; release_dates: { type: number; release_date: string }[] }[] };
  'watch/providers'?: { results?: Record<string, { flatrate?: { provider_name: string; logo_path: string | null }[] }> };
}

async function watchlistMovieIds(userId: string): Promise<Set<number>> {
  const rows = await db
    .select({ mediaId: watchlistItems.mediaId })
    .from(watchlistItems)
    .innerJoin(watchlists, eq(watchlists.id, watchlistItems.watchlistId))
    .where(and(eq(watchlists.userId, userId), eq(watchlistItems.mediaType, 'movie'), ne(watchlistItems.status, 'finished')))
    .limit(60);
  return new Set(rows.map((r) => Number(r.mediaId)).filter(Number.isFinite));
}

async function filmFor(id: number, region: string, today: string, pinned: boolean, tally: Tally): Promise<NewFilm | null> {
  tally.tried += 1;
  const m = await tmdbFetch<MovieDetail>(`/movie/${id}`, { append_to_response: 'release_dates,credits,watch/providers' }, { cache: DETAIL_CACHE }).catch(() => tally.fail());
  if (!m) return null;
  const local = m.release_dates?.results.find((r) => r.iso_3166_1 === region)?.release_dates ?? [];
  const first = (types: number[]) =>
    local
      .filter((d) => types.includes(d.type))
      .map((d) => d.release_date.slice(0, 10))
      .sort()[0] ?? null;
  const wide = first([3]);
  const limited = first([2]);
  const digital = first([4]);
  const theatrical = [wide, limited].filter(Boolean).sort()[0] ?? null;

  // In the window: opened in the last week, or opening in the next ~8 weeks.
  const inWindow = (d: string | null, back: number) => !!d && d >= addDays(today, -back) && d <= addDays(today, 60);
  const offer = m['watch/providers']?.results?.[region]?.flatrate?.[0] ?? null;
  let date: string;
  let kind: NewFilm['kind'];
  if (inWindow(theatrical, 7) && (!digital || theatrical! >= digital)) {
    date = theatrical!;
    kind = wide && wide === theatrical ? 'cinema' : 'limited';
  } else if (inWindow(digital, 14)) {
    date = digital!;
    kind = 'digital';
  } else {
    return null;
  }
  const where = kind === 'digital' ? (offer ? `On ${offer.provider_name}` : 'Rent or buy') : kind === 'limited' ? 'Limited release' : 'In cinemas';

  return {
    key: `movie:${m.id}`,
    tmdbId: m.id,
    title: m.title,
    year: m.release_date?.slice(0, 4) || null,
    director: m.credits?.crew?.find((c) => c.job === 'Director')?.name ?? null,
    date,
    kind,
    where,
    service: kind === 'digital' ? (offer?.provider_name ?? null) : null,
    serviceLogo: kind === 'digital' ? buildImageUrl(offer?.logo_path, 'w92') : null,
    poster: buildImageUrl(m.poster_path, 'w342'),
    backdrop: buildImageUrl(m.backdrop_path, 'w780'),
    overview: m.overview?.trim() || null,
    pinned,
  };
}


/** The country's arrivals: cinema and limited openings, then digital arrivals. No member data. */
async function sharedFilms(region: string, today: string, tally: Tally): Promise<NewFilm[]> {
  const params = (types: string, from: number, to: number, page: number) => ({
    region,
    with_release_type: types,
    'release_date.gte': addDays(today, from),
    'release_date.lte': addDays(today, to),
    sort_by: 'popularity.desc',
    include_adult: false,
    page,
  });
  const pages = await Promise.all([
    tmdbFetch<DiscoverPage>('/discover/movie', params('2|3', -7, 42, 1), { cache: DETAIL_CACHE }).catch(() => null),
    tmdbFetch<DiscoverPage>('/discover/movie', params('4', -14, 30, 1), { cache: DETAIL_CACHE }).catch(() => null),
    tmdbFetch<DiscoverPage>('/discover/movie', params('2|3', -7, 42, 2), { cache: DETAIL_CACHE }).catch(() => null),
  ]);
  if (pages.every((p) => !p)) throw new Error('film lists unavailable');
  const ids = new Set<number>();
  for (const page of pages) for (const r of page?.results ?? []) ids.add(r.id);
  const films = await mapWithConcurrency([...ids].slice(0, 70), 8, (id) => filmFor(id, region, today, false, tally));
  // A few past FILMS_MAX, so the board stays full once the member's own films are taken out.
  return films.filter((f): f is NewFilm => f !== null).slice(0, FILMS_MAX + FILMS_BUFFER);
}

// ---------------------------------------------------------------------------
// TV
// ---------------------------------------------------------------------------

interface TvDetail {
  id: number;
  name: string;
  poster_path: string | null;
  backdrop_path: string | null;
  networks?: { id: number; name: string; logo_path: string | null; origin_country?: string }[];
  'watch/providers'?: { results?: Record<string, { flatrate?: { provider_id: number; provider_name: string; logo_path: string | null }[] }> };
  genres?: { id: number }[];
  next_episode_to_air?: { air_date: string | null; season_number: number } | null;
}

interface SeasonDetail {
  episodes?: { air_date: string | null; episode_number: number; season_number: number; name: string; episode_type?: string }[];
}

async function myShowIds(userId: string): Promise<number[]> {
  const [alerts, items] = await Promise.all([
    db
      .select({ mediaId: titleAlerts.mediaId })
      .from(titleAlerts)
      .where(and(eq(titleAlerts.userId, userId), eq(titleAlerts.mediaType, 'tv'))),
    db
      .select({ mediaId: watchlistItems.mediaId })
      .from(watchlistItems)
      .innerJoin(watchlists, eq(watchlists.id, watchlistItems.watchlistId))
      .where(
        and(
          eq(watchlists.userId, userId),
          eq(watchlistItems.mediaType, 'tv'),
          inArray(watchlistItems.status, ['watching', 'up_next', 'waiting_for_episode', 'waiting_for_season', 'just_added', 'rewatch']),
        ),
      )
      .limit(80),
  ]);
  return [...new Set([...alerts, ...items].map((r) => Number(r.mediaId)).filter(Number.isFinite))].slice(0, MY_SHOWS_MAX);
}

type ChannelInfo = Omit<NewChannel, 'mine' | 'shows'>;
type Airing = { show: NewShow; channel: ChannelInfo };

/** Where a show reaches the member: the local service for a streamer's show, else its network. Null = not in this country. */
function channelFor(s: TvDetail, region: string, mine: boolean): ChannelInfo | null {
  const net = s.networks?.[0];
  if (!net) return { key: 'net:other', name: 'Other', logo: null, streaming: false, elsewhere: null };
  const home = net.origin_country || null;
  if (STREAMING_IDS.has(net.id)) {
    const local = s['watch/providers']?.results?.[region]?.flatrate?.[0];
    if (local) return { key: `prov:${local.provider_id}`, name: local.provider_name, logo: buildImageUrl(local.logo_path, 'w92'), streaming: true, elsewhere: null };
    // Not streaming here: only your own shows stay, marked with the streamer's home.
    if (!mine) return null;
    return { key: `net:${net.id}`, name: net.name, logo: buildImageUrl(net.logo_path, 'w92'), streaming: true, elsewhere: home && home !== region ? home : null };
  }
  return { key: `net:${net.id}`, name: net.name, logo: buildImageUrl(net.logo_path, 'w92'), streaming: false, elsewhere: home && home !== region ? home : null };
}

async function showFor(id: number, mine: boolean, region: string, days: string[], tally: Tally): Promise<Airing | null> {
  tally.tried += 1;
  const s = await tmdbFetch<TvDetail>(`/tv/${id}`, { append_to_response: 'watch/providers' }, { cache: DETAIL_CACHE }).catch(() => tally.fail());
  const next = s?.next_episode_to_air;
  if (!s || !next?.air_date || next.air_date > days[days.length - 1]) return null;
  if (!mine && s.genres?.some((g) => FILLER_GENRES.has(g.id))) return null;
  const channel = channelFor(s, region, mine);
  if (!channel) return null;
  // Every episode of that season this week (daily shows, whole-season drops).
  tally.tried += 1;
  const season = await tmdbFetch<SeasonDetail>(`/tv/${id}/season/${next.season_number}`, {}, { cache: DETAIL_CACHE }).catch(() => tally.fail());
  const inWeek = (season?.episodes ?? []).filter((e) => e.air_date && e.air_date >= days[0] && e.air_date <= days[days.length - 1]);
  if (!inWeek.length) return null;
  const byDay = new Map<string, NewEpisode>();
  for (const e of inWeek) {
    const day = e.air_date!;
    const flag: NewEpisode['flag'] = e.episode_number === 1 ? 'premiere' : e.episode_type === 'finale' ? 'finale' : null;
    const at = byDay.get(day);
    if (at) {
      at.count += 1;
      at.flag = at.flag ?? flag;
    } else {
      byDay.set(day, { date: day, season: e.season_number, episode: e.episode_number, name: e.name || null, count: 1, flag });
    }
  }
  return {
    show: {
      key: `tv:${s.id}`,
      tmdbId: s.id,
      title: s.name,
      poster: buildImageUrl(s.poster_path, 'w342'),
      backdrop: buildImageUrl(s.backdrop_path, 'w780'),
      mine,
      episodes: [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)),
    },
    channel,
  };
}

/** The country's week of TV: streaming originals (season drops included), then what's on air. No member data. */
async function sharedShows(region: string, days: string[], tally: Tally): Promise<Airing[]> {
  const streamingParams = (page: number) => ({
    'air_date.gte': days[0],
    'air_date.lte': days[days.length - 1],
    with_networks: STREAMING_NETWORKS.join('|'),
    sort_by: 'popularity.desc',
    page,
  });
  const [streaming1, streaming2, popular1, popular2] = await Promise.all([
    tmdbFetch<DiscoverPage>('/discover/tv', streamingParams(1), { cache: DETAIL_CACHE }).catch(() => null),
    tmdbFetch<DiscoverPage>('/discover/tv', streamingParams(2), { cache: DETAIL_CACHE }).catch(() => null),
    tmdbFetch<DiscoverPage>('/tv/on_the_air', { page: 1 }, { region, cache: DETAIL_CACHE }).catch(() => null),
    tmdbFetch<DiscoverPage>('/tv/on_the_air', { page: 2 }, { region, cache: DETAIL_CACHE }).catch(() => null),
  ]);
  if (![streaming1, streaming2, popular1, popular2].some(Boolean)) throw new Error('tv lists unavailable');
  const taken = new Set<number>();
  const pick = (pages: (DiscoverPage | null)[], max: number) => {
    const out: number[] = [];
    for (const r of pages.flatMap((p) => p?.results ?? [])) {
      if (out.length >= max) break;
      if (!taken.has(r.id)) {
        taken.add(r.id);
        out.push(r.id);
      }
    }
    return out;
  };
  const ids = [...pick([streaming1, streaming2], STREAMING_SHOWS_MAX), ...pick([popular1, popular2], POPULAR_SHOWS_MAX)];
  const found = await mapWithConcurrency(ids, 8, (id) => showFor(id, false, region, days, tally));
  return found.filter((f): f is Airing => f !== null);
}

// ---------------------------------------------------------------------------
// Caches. The country's part (most of the work) is shared by every member
// there and is never keyed by or built from a member; the member's own part
// (watchlist films, followed shows) is small and tagged.
// ---------------------------------------------------------------------------

/** Counts TMDB reads during a build, so a mostly-failed build is thrown (never cached) rather than stored for 6h. */
class Tally {
  tried = 0;
  failed = 0;
  fail(): null {
    this.failed += 1;
    return null;
  }
  check(label: string): void {
    if (this.tried && this.failed / this.tried > 0.33) throw new Error(`${label}: ${this.failed}/${this.tried} TMDB reads failed`);
  }
}

const weekOf = (today: string) => Array.from({ length: 7 }, (_, i) => addDays(today, i));

type FeedPart = { films: NewFilm[]; shows: Airing[] };
const EMPTY: FeedPart = { films: [], shows: [] };

async function buildShared(region: string, today: string): Promise<FeedPart> {
  const tally = new Tally();
  const [films, shows] = await Promise.all([sharedFilms(region, today, tally), sharedShows(region, weekOf(today), tally)]);
  tally.check(`[new] shared ${region}`);
  return { films, shows };
}

async function buildMember(userId: string, region: string, today: string): Promise<FeedPart> {
  const tally = new Tally();
  const days = weekOf(today);
  const [filmIds, showIds] = await Promise.all([watchlistMovieIds(userId), myShowIds(userId)]);
  const [films, shows] = await Promise.all([
    mapWithConcurrency([...filmIds], 8, (id) => filmFor(id, region, today, true, tally)),
    mapWithConcurrency(showIds, 8, (id) => showFor(id, true, region, days, tally)),
  ]);
  tally.check('[new] member');
  return { films: films.filter((f): f is NewFilm => f !== null), shows: shows.filter((s): s is Airing => s !== null) };
}

/** Shared per country and day (6h). */
const getShared = (region: string, today: string) => unstable_cache(() => buildShared(region, today), ['new-shared-v1', region, today], { revalidate: 21600 })();

/** Per member (6h), expired by watchlist and show-alert writes (`invalidateNewFeed`). */
const getMember = (userId: string, region: string, today: string) =>
  unstable_cache(() => buildMember(userId, region, today), ['new-member-v1', userId, region, today], { revalidate: 21600, tags: [newFeedTag(userId)] })();

/** Your films first, then the country's (yours taken out); your shows merged into their channels. */
function merge(region: string, today: string, shared: FeedPart, member: FeedPart): NewFeed {
  const pinnedIds = new Set(member.films.map((f) => f.tmdbId));
  const films = [
    ...[...member.films].sort((a, b) => a.date.localeCompare(b.date)),
    ...shared.films
      .filter((f) => !pinnedIds.has(f.tmdbId))
      .slice(0, FILMS_MAX)
      .sort((a, b) => a.date.localeCompare(b.date)),
  ];

  const mineIds = new Set(member.shows.map((a) => a.show.tmdbId));
  const channels = new Map<string, NewChannel>();
  for (const a of [...member.shows, ...shared.shows.filter((a) => !mineIds.has(a.show.tmdbId))]) {
    const ch = channels.get(a.channel.key) ?? { ...a.channel, mine: false, shows: [] };
    ch.shows.push(a.show);
    ch.mine ||= a.show.mine;
    channels.set(a.channel.key, ch);
  }
  for (const ch of channels.values()) ch.shows.sort((a, b) => Number(b.mine) - Number(a.mine));
  // Your channels, then local streamers, then local TV, then channels abroad; busiest first within each.
  const ordered = [...channels.values()]
    .sort((a, b) => Number(b.mine) - Number(a.mine) || Number(!b.elsewhere) - Number(!a.elsewhere) || Number(b.streaming) - Number(a.streaming) || b.shows.length - a.shows.length)
    .slice(0, CHANNELS_MAX);

  return { region, today, days: weekOf(today), films, channels: ordered, hasShows: member.shows.length > 0 };
}

/**
 * The member's feed for a country and day. A part that fails renders empty
 * for this request only (nothing was cached), so the next visit retries.
 */
export async function getNewFeed(userId: string, region: string, today: string): Promise<NewFeed> {
  const [shared, member] = await Promise.all([
    getShared(region, today).catch((err) => {
      logger.warn('[new] shared feed failed', { err, region });
      return EMPTY;
    }),
    getMember(userId, region, today).catch((err) => {
      logger.warn('[new] member feed failed', { err });
      return EMPTY;
    }),
  ]);
  return merge(region, today, shared, member);
}
