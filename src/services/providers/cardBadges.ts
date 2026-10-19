import { movie, tv } from '@/server/tmdb';
import { getJustWatchOffers } from '@/services/justwatch';
import { cleanProviderName } from '@/utils/providers';
import { mapWithConcurrency } from '@/lib/concurrency';
import { z } from 'zod';
import { ValidationAppError } from '@/utils/errors';

// Availability badges for poster cards (search, discover, collection and
// artist pages). Card rules: the user's region only — TMDB, then JustWatch
// for the same region — never another country. A title that was checked and
// has nothing comes back as an empty list ("Not in your region"); a title
// whose lookup failed is left out (no pill rather than a wrong one).

export interface CardBadge {
  provider_name: string;
  logo_path: string | null;
  /** TMDB provider id — absent for JustWatch-sourced badges. */
  provider_id?: number;
}

export interface BadgeTarget {
  mediaType: 'movie' | 'tv';
  id: number;
  /** Needed for the JustWatch fallback match. */
  title: string;
  year: string | null;
}

export const badgeKey = (t: { mediaType: string; id: number }) => `${t.mediaType}-${t.id}`;

// Normalize raw TMDB provider rows and dedupe so the badge strip doesn't show
// "Amazon Prime Video" + "Amazon Prime Video With Ads" as two pills.
function cleanProviders(
  rows: { provider_name: string; logo_path: string | null; provider_id?: number }[],
): CardBadge[] {
  const seen = new Set<string>();
  const out: CardBadge[] = [];
  for (const r of rows) {
    const name = cleanProviderName(r.provider_name);
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ provider_name: name, logo_path: r.logo_path, provider_id: r.provider_id });
  }
  return out;
}

// JustWatch fallback when TMDB has no providers for the region.
async function justWatchBadges(t: BadgeTarget, region: string): Promise<CardBadge[] | null> {
  if (!t.title) return null;
  const fallback = await getJustWatchOffers({ tmdbId: t.id, mediaType: t.mediaType, title: t.title, year: t.year, region });
  if (!fallback) return null;
  // JustWatch already runs names through cleanProviderName, so no second pass.
  if (fallback.providers.streaming.length > 0) {
    return fallback.providers.streaming.map((p) => ({ provider_name: p.provider_name, logo_path: p.logo_path }));
  }
  if (fallback.providers.rent.length > 0 || fallback.providers.buy.length > 0) {
    return [{ provider_name: 'Rent', logo_path: null }];
  }
  return null;
}

/**
 * Badges per title for `region`, keyed by `badgeKey`. Streaming/ads/free
 * providers first; rent/buy-only titles get a single "Rent" pill. 5 lookups
 * at a time to stay inside TMDB's rate limits.
 */
export async function getCardBadges(targets: BadgeTarget[], region: string): Promise<Map<string, CardBadge[]>> {
  const out = new Map<string, CardBadge[]>();
  await mapWithConcurrency(targets, 5, async (t) => {
    try {
      const result = t.mediaType === 'movie' ? await movie.watchProviders(t.id) : await tv.watchProviders(t.id);
      const regionData = result.results?.[region];
      const flatrateLike = [...(regionData?.flatrate || []), ...(regionData?.ads || []), ...(regionData?.free || [])];
      if (flatrateLike.length > 0) {
        out.set(badgeKey(t), cleanProviders(flatrateLike));
        return;
      }
      if ((regionData?.rent?.length ?? 0) > 0 || (regionData?.buy?.length ?? 0) > 0) {
        out.set(badgeKey(t), [{ provider_name: 'Rent', logo_path: null }]);
        return;
      }
      // Nothing on TMDB for this region: JustWatch, same region only. An
      // empty entry means "checked, not available here".
      out.set(badgeKey(t), (await justWatchBadges(t, region)) ?? []);
    } catch (error: unknown) {
      console.warn(`Failed to fetch providers for ${t.mediaType} ${t.id}`, error);
    }
  });
  return out;
}

export const BADGES_BATCH_MAX = 40;

const badgesRequestSchema = z.object({
  region: z.string().regex(/^[A-Z]{2}$/, 'Invalid region'),
  items: z
    .array(
      z.object({
        mediaType: z.enum(['movie', 'tv']),
        id: z.number().int().positive(),
        title: z.string().max(300),
        year: z.string().regex(/^\d{4}$/).nullable(),
      }),
    )
    .min(1)
    .max(BADGES_BATCH_MAX),
});

/**
 * Validated entry point for the badges endpoint (pages that render cached,
 * region-agnostic HTML and fill badges in client-side). Returns
 * `badgeKey → badges`; failed lookups are absent.
 */
export async function getCardBadgesForRequest(input: unknown): Promise<Record<string, CardBadge[]>> {
  const parsed = badgesRequestSchema.safeParse(input);
  if (!parsed.success) throw new ValidationAppError(parsed.error.issues[0]?.message ?? 'Invalid request');
  const map = await getCardBadges(parsed.data.items, parsed.data.region);
  return Object.fromEntries(map);
}
