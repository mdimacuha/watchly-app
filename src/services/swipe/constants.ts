export const SWIPE_ACTIONS = ['liked', 'passed', 'saved', 'opened'] as const;
export type SwipeAction = (typeof SWIPE_ACTIONS)[number];

/**
 * Actions that are an actual verdict on a title. These hide it from the deck
 * and For You; "opened" (a Quick View peek) does not.
 */
export const DECIDED_SWIPE_ACTIONS: SwipeAction[] = ['liked', 'passed', 'saved'];

export const SWIPE_SOURCES = [
  'swipe_discovery',
  'onboarding',
  'recommendation',
  'manual',
] as const;
export type SwipeSource = (typeof SWIPE_SOURCES)[number];

export const TITLE_TYPES = ['movie', 'tv'] as const;
export type TitleType = (typeof TITLE_TYPES)[number];

/** Default page size for /api/v1/swipe/deck. Tradeoff: more = fewer
 *  refetches, but more TMDB fan-out cost per request. */
export const SWIPE_DECK_DEFAULT_LIMIT = 20;
export const SWIPE_DECK_MAX_LIMIT = 50;

/** When `available.length - currentIndex <= PREFETCH_WHEN_REMAINING`,
 *  the client pulls another page in the background. */
export const SWIPE_PREFETCH_WHEN_REMAINING = 5;

/**
 * Cadence for wildcard injection — every Nth card (positions 9, 19,
 * 29, …) is a title pulled from /trending, not the personalised seed
 * pool. Breaks filter-bubble fatigue and produces the highest-
 * information swipes (off-taste signal teaches the most).
 */
export const SWIPE_WILDCARD_EVERY = 10;
