import 'server-only';

import { movie } from '@/server/tmdb';
import { buildImageUrl } from '@/lib/tmdb';
import { logger } from '@/lib/log';
import { getForYouPool } from '@/services/forYou/pool';
import { getOnboardingState } from './progress';

/** Tonight's ticket at the end of the first run, and the ones "Seen it, next" swaps to. */
export interface FirstTicket {
  key: string;
  href: string;
  title: string;
  mediaType: 'movie' | 'tv';
  year: string | null;
  runtime: number | null;
  backdrop: string | null;
  poster: string | null;
  service: string;
  serviceLogo: string | null;
  why: string | null;
}

export interface FirstTickets {
  tickets: FirstTicket[];
  /** 'pool' = built from their picks; 'fallback' = well-loved and streaming in their region. */
  source: 'pool' | 'fallback';
}

const MAX_TICKETS = 6;

/** Well-loved films actually streaming in the region, for a cold or empty pool. */
async function fallbackTickets(region: string, providerIds: number[], exclude: Set<string>): Promise<FirstTicket[]> {
  const list = await movie.topRated({ page: 1, region }).catch(() => null);
  const candidates = (list?.results ?? [])
    .filter((r) => r.backdropPath && (r.voteCount ?? 0) >= 3000 && !exclude.has(`movie:${r.id}`))
    .slice(0, 12);
  const checked = await Promise.all(
    candidates.map(async (r): Promise<FirstTicket | null> => {
      const [wp, details] = await Promise.all([movie.watchProviders(r.id).catch(() => null), movie.details(r.id).catch(() => null)]);
      const flat = (wp?.results?.[region]?.flatrate ?? []) as { provider_id: number; provider_name: string; logo_path: string | null }[];
      // On one of their screens if they told us, else any subscription here.
      const offer = (providerIds.length ? flat.find((p) => providerIds.includes(p.provider_id)) : null) ?? flat[0];
      if (!offer) return null;
      return {
        key: `movie:${r.id}`,
        href: `/title/movie/${r.id}`,
        title: r.title,
        mediaType: 'movie',
        year: r.releaseDate?.slice(0, 4) || null,
        runtime: details?.runtime ?? null,
        backdrop: buildImageUrl(r.backdropPath, 'w780'),
        poster: buildImageUrl(r.posterPath, 'w342'),
        service: offer.provider_name,
        serviceLogo: buildImageUrl(offer.logo_path, 'w92'),
        why: null,
      };
    }),
  );
  return checked.filter((t): t is FirstTicket => t !== null).slice(0, MAX_TICKETS);
}

/**
 * The first ticket: picks from the person's own For You pool that are
 * streaming in their region, never a title they picked on the taste step.
 * Falls back to well-loved films streaming there, so the reveal is never
 * blank. A cold pool build is slow; the client warms it once the region is
 * saved, so this usually reads a warm cache.
 */
export async function getFirstTickets(
  userId: string,
  region: string,
  opts: { exclude: string[]; providerIds: number[] },
): Promise<FirstTickets> {
  const exclude = new Set(opts.exclude);
  try {
    const pool = await getForYouPool(userId, region);
    const tickets = pool.picks
      .filter((p) => p.ui.providers[0] && !exclude.has(p.key))
      .slice(0, MAX_TICKETS)
      .map((p): FirstTicket => {
        const offer = p.ui.providers[0];
        return {
          key: p.key,
          href: `/title/${p.ui.mediaType}/${p.ui.tmdbId}`,
          title: p.ui.title,
          mediaType: p.ui.mediaType,
          year: p.ui.year,
          runtime: p.ui.runtimeMinutes,
          backdrop: buildImageUrl(p.ui.backdropPath, 'w780'),
          poster: buildImageUrl(p.ui.posterPath, 'w342'),
          service: offer.providerName,
          serviceLogo: buildImageUrl(offer.logoPath, 'w92'),
          why: p.reasons[0] ?? null,
        };
      });
    if (tickets.length >= 2) return { tickets, source: 'pool' };
  } catch (err) {
    logger.warn('[onboarding] pool unavailable for first ticket', { err });
  }
  return { tickets: await fallbackTickets(region, opts.providerIds, exclude), source: 'fallback' };
}

/**
 * The first ticket for a signed-in person: their saved region (else the one
 * their browser has, else US), their screens, and never one of their picks.
 */
export async function getFirstTicketsForUser(userId: string, browserRegion: string | null): Promise<FirstTickets> {
  const state = await getOnboardingState(userId);
  const region = state?.regionCode ?? (browserRegion && /^[A-Z]{2}$/.test(browserRegion) ? browserRegion : 'US');
  return getFirstTickets(userId, region, {
    exclude: state?.picks.map((p) => p.key) ?? [],
    providerIds: state?.selectedProviders ?? [],
  });
}
