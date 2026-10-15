/**
 * SEO constants + helpers. Server-only surface (metadata, sitemap, robots,
 * JSON-LD, OG image routes) — do not import from client components.
 *
 * The canonical origin is ALWAYS `https://app.gowatchly.com` — the target of
 * the migration. This is deliberately NOT derived from `PUBLIC_APP_URL`:
 * that var is the app's current runtime origin for email links, and in
 * production it's still the OLD `watchly.dayonelabs.co` host. Coupling SEO to
 * it made every canonical/OG/sitemap URL point at the old domain, which both
 * broke the GSC sitemap (property = app.gowatchly.com, URLs = old domain →
 * every URL rejected) and consolidated ranking signals onto the domain we're
 * deprecating. Canonicalizing to production from every environment (dev,
 * preview, old host) is the correct behavior. Override only via the dedicated
 * `NEXT_PUBLIC_SITE_URL` if the canonical domain itself ever changes.
 */

/** Canonical production origin, no trailing slash. */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || 'https://app.gowatchly.com'
).replace(/\/+$/, '');

export const SITE_NAME = 'Watchly';

/** Bare title used on the homepage and as the OG/Twitter default. */
export const SITE_TITLE = 'Watchly — Find Where to Stream Movies & TV Shows';

/** `%s` is replaced by the per-page title (see root layout title.template). */
export const TITLE_TEMPLATE = `%s | ${SITE_NAME}`;

export const SITE_DESCRIPTION =
  'Find where to watch movies and TV shows across Netflix, Disney+, Prime Video, ' +
  'Max, and 100+ streaming services with region-aware availability. Track ' +
  'everything in one universal watchlist.';

/** Build an absolute URL on the canonical origin from a root-relative path. */
export function absoluteUrl(path = '/'): string {
  if (/^https?:\/\//.test(path)) return path;
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

/** First 4 digits of a TMDB date string (`2014-11-05` → `2014`), or null. */
export function yearOf(date?: string | null): string | null {
  if (!date) return null;
  const m = /^(\d{4})/.exec(date);
  return m ? m[1] : null;
}

/**
 * Collapse whitespace and hard-truncate to `max` chars on a word boundary,
 * appending an ellipsis. Meta descriptions render ~155–160 chars in SERPs.
 */
export function clampDescription(text: string | null | undefined, max = 160): string {
  const clean = (text ?? '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const slice = clean.slice(0, max - 1);
  const lastSpace = slice.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? slice.slice(0, lastSpace) : slice).trimEnd()}…`;
}
