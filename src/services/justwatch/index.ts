// JustWatch fallback for provider availability when TMDB has no data for the
// user's region. Returns providers in the same shape as services/tmdb/title
// so downstream rendering (ProviderSection, ProviderBadge) doesn't branch.
import "server-only";

import { searchByTitle, getOffersByPath } from "@/server/justwatch";
import type { JustWatchNode, JustWatchOffer } from "@/server/justwatch";
import { getProvidersCatalog } from "@/server/tmdb/providersCatalog";
import type { Provider } from "@/services/tmdb/title";
import { cleanProviderName } from "@/utils/providers";

// Match normalizeProviderName in providersCatalog.ts so we can look up TMDB
// provider_id from a JustWatch clearName.
function normalizeKey(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/&/g, "and")
    .replace(/[+]/g, "-plus")
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-");
}

interface JustWatchProviderBucket {
  streaming: Provider[];
  rent: Provider[];
  buy: Provider[];
}

export interface JustWatchFallbackResult {
  providers: JustWatchProviderBucket;
  /** JustWatch's URL for the title in this region — useful for "View on JustWatch" links. */
  justWatchUrl: string | null;
}

/**
 * Returns providers for a TMDB title in the user's region by querying JustWatch
 * directly. Returns `null` when:
 *  - no JustWatch match is found, or
 *  - the matched entry has no offers in the requested region.
 *
 * Two-step lookup: search by title (in `US` for broad results) → match by
 * `externalIds.tmdbId` → fetch offers for the user's region using the matched
 * entry's `fullPath`. Both calls are 24h-cached by the underlying client.
 */
export async function getJustWatchOffers(opts: {
  tmdbId: string | number;
  mediaType: "movie" | "tv";
  title: string;
  year: string | null;
  region: string;
}): Promise<JustWatchFallbackResult | null> {
  // JustWatch returns tmdbId as a string; normalize ours to string too.
  const tmdbIdStr = String(opts.tmdbId).trim();
  if (!tmdbIdStr) return null;

  let matched: JustWatchNode | null = null;
  try {
    // Search in a broad-catalog region. JustWatch's search returns the same
    // entries regardless of country; we just need the tmdbId match.
    const candidates = await searchByTitle({
      query: opts.title,
      country: "US",
      mediaType: opts.mediaType,
      first: 10,
    });

    matched =
      candidates.find((c) => c.content.externalIds.tmdbId === tmdbIdStr) ?? null;

    // Fallback: if no tmdbId hit and we have a year, accept a fuzzy match on
    // (title, year). Defensive — JustWatch occasionally lacks the tmdbId link.
    if (!matched && opts.year) {
      const targetYear = parseInt(opts.year, 10);
      matched =
        candidates.find(
          (c) =>
            c.content.title.toLowerCase() === opts.title.toLowerCase() &&
            c.content.originalReleaseYear === targetYear,
        ) ?? null;
    }
  } catch (err) {
    console.warn("[justwatch] search failed:", err);
    return null;
  }

  if (!matched) return null;

  // Re-query for the user's region using the matched fullPath. The search
  // call's offers are for `US` only; we need a region-specific lookup.
  let node: JustWatchNode | null;
  try {
    node = await getOffersByPath({
      fullPath: matched.content.fullPath,
      country: opts.region,
    });
  } catch (err) {
    console.warn("[justwatch] offers fetch failed:", err);
    return null;
  }

  if (!node || !node.offers || node.offers.length === 0) return null;

  const catalog = await getProvidersCatalog();
  const catalogByKey = new Map(catalog.providers.map((p) => [p.key, p]));

  const buckets: JustWatchProviderBucket = {
    streaming: [],
    rent: [],
    buy: [],
  };

  // De-dupe by package (multiple presentationTypes — SD/HD/4K — per provider).
  const seenInBucket = {
    streaming: new Set<string>(),
    rent: new Set<string>(),
    buy: new Set<string>(),
  };

  for (const offer of node.offers) {
    const bucketName = bucketFor(offer);
    if (!bucketName) continue;

    // Look up against the catalog using the *raw* JustWatch clearName, since
    // the catalog stores keys derived from raw TMDB names too. Only collapse
    // to a clean display name (Disney Plus → Disney+) after the lookup.
    const rawKey = normalizeKey(offer.package.clearName);
    const cleanName = cleanProviderName(offer.package.clearName);
    const cleanKey = normalizeKey(cleanName);

    // Dedupe by the clean key — multiple raw rows can collapse to one display.
    if (seenInBucket[bucketName].has(cleanKey)) continue;
    seenInBucket[bucketName].add(cleanKey);

    const tmdbMatch =
      catalogByKey.get(rawKey) ?? catalogByKey.get(cleanKey) ?? null;

    const provider: Provider = {
      // Negative IDs for unmatched providers so they can't collide with TMDB
      // IDs in ProviderBadge's PROVIDER_STYLE_OVERRIDES lookup. The badge
      // will then fall through to the key-based lookup we share with TMDB.
      provider_id: tmdbMatch?.provider_id ?? -hashKey(cleanKey),
      provider_name: cleanName,
      logo_path: tmdbMatch?.logo_path ?? offer.package.icon ?? null,
      display_priority: tmdbMatch?.display_priority,
    };

    buckets[bucketName].push(provider);
  }

  buckets.streaming.sort(byDisplayPriority);
  buckets.rent.sort(byDisplayPriority);
  buckets.buy.sort(byDisplayPriority);

  // Derive a region-scoped JustWatch URL. fullPath is locale-prefixed
  // (e.g. /us/tv-show/lost); swap the locale to the user's region.
  const justWatchUrl = buildJustWatchUrl(matched.content.fullPath, opts.region);

  const hasAny =
    buckets.streaming.length + buckets.rent.length + buckets.buy.length > 0;
  if (!hasAny) return null;

  return { providers: buckets, justWatchUrl };
}

function bucketFor(offer: JustWatchOffer): keyof JustWatchProviderBucket | null {
  switch (offer.monetizationType) {
    case "FLATRATE":
    case "FREE":
    case "ADS":
      return "streaming";
    case "RENT":
      return "rent";
    case "BUY":
      return "buy";
    default:
      return null;
  }
}

function byDisplayPriority(a: Provider, b: Provider): number {
  return (a.display_priority ?? 999) - (b.display_priority ?? 999);
}

// Stable positive hash so unmatched-provider IDs are consistent across renders.
function hashKey(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) {
    h = (h * 31 + key.charCodeAt(i)) | 0;
  }
  return Math.abs(h) || 1;
}

function buildJustWatchUrl(fullPath: string, region: string): string | null {
  // fullPath like "/us/tv-show/lost" → "/ph/tv-show/lost"
  const m = fullPath.match(/^\/[a-z]{2}(\/.*)$/i);
  if (!m) return null;
  return `https://www.justwatch.com/${region.toLowerCase()}${m[1]}`;
}
