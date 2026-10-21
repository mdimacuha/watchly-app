import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo';

/**
 * Served at `/robots.txt` for the Watchly APP (app.gowatchly.com).
 *
 * The app is intentionally NOT search-indexed — the marketing site
 * (gowatchly.com) carries all public SEO. Every app page also emits `noindex`
 * (root layout metadata). This file additionally keeps search crawlers OUT of
 * the app's very large dynamic route space (title/artist/tv/collection), which
 * was driving crawl volume and Vercel usage. There is deliberately NO sitemap —
 * the app advertises no crawlable URLs.
 *
 * Social / link-preview bots (Facebook, Twitter/X, Slack, Discord, etc.) are
 * allowed through so shared links (e.g. title pages) still render OG/Twitter
 * cards. `noindex` keeps those pages out of search results regardless of crawl.
 *
 * NOTE (de-indexing nuance): disallowing a path means a search engine can't
 * fetch it to see the `noindex`, so any pages ALREADY indexed can linger as
 * "blocked" results. The app was only just SEO-enabled, so little is indexed;
 * if clean de-indexing of already-indexed URLs matters more than crawl volume,
 * temporarily allow crawling (noindex does the removal) and re-block afterward.
 */

// The app has no indexable content, so search engines are kept out of the whole
// content + app surface (each path prefix below). We intentionally do NOT block
// `/_next/` or other static assets.
const DISALLOW_FROM_SEARCH = [
  '/api/',
  '/s/', // short-link redirects — no crawlable content
  // Public TMDB content routes — huge dynamic space, all noindex:
  '/title/',
  '/artist/',
  '/tv/',
  '/collection/',
  // Authenticated app
  '/me',
  '/settings',
  '/onboarding',
  '/for-you',
  '/programme',
  '/favorites',
  '/activity',
  '/notifications',
  '/swipe',
  '/watchlists',
  '/user/',
  // Auth flows
  '/signin',
  '/signup',
  '/sign-up',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
  '/restore-account',
  // Thin/duplicate + dev-only
  '/search',
  '/debug',
  '/docs',
];

// Link-unfurlers allowed through so shared links still preview. These bots use
// their own robots group, so they ignore the `*` disallow above.
const SOCIAL_PREVIEW_BOTS = [
  'facebookexternalhit',
  'Facebot',
  'Twitterbot',
  'Slackbot',
  'Slackbot-LinkExpanding',
  'Discordbot',
  'WhatsApp',
  'LinkedInBot',
  'TelegramBot',
  'redditbot',
  'Pinterest',
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // Search engines & everything else: stay out of the app route space.
      { userAgent: '*', disallow: DISALLOW_FROM_SEARCH },
      // Social preview crawlers: allowed so shared links still unfurl.
      { userAgent: SOCIAL_PREVIEW_BOTS, allow: '/' },
    ],
    host: SITE_URL,
    // No `sitemap` — the app deliberately advertises no crawlable URLs.
  };
}
