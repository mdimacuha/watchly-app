/**
 * Crawler detection shared by `robots.ts` and the middleware.
 *
 * The app is not meant to be crawled (robots.txt disallows the whole content
 * space), but crawlers that ignore robots.txt still walk thousands of title
 * pages. Each first visit renders and writes an ISR page plus its TMDB data,
 * which is what blew through the Vercel ISR-write quota. The middleware turns
 * those requests away before they render.
 */

// Link-unfurlers allowed through so shared links still preview.
export const SOCIAL_PREVIEW_BOTS = [
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

const SOCIAL_PREVIEW_RE = new RegExp(SOCIAL_PREVIEW_BOTS.join('|'), 'i');

// Generic crawler / scraper signatures. `(?<!cu)bot` skips CUBOT phones.
const CRAWLER_RE =
  /(?<!cu)bot|crawl|spider|slurp|scrapy|python-|aiohttp|go-http-client|curl\/|wget|headless|meta-externalagent|anthropic-ai|claude-web|perplexity/i;

/** True for crawlers that should not render app pages (social previewers excepted). */
export function isBlockedCrawler(userAgent: string | null): boolean {
  if (!userAgent) return false;
  if (SOCIAL_PREVIEW_RE.test(userAgent)) return false;
  return CRAWLER_RE.test(userAgent);
}
