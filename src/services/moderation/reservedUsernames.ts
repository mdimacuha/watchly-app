/**
 * Usernames that can never be claimed. Two categories blended:
 *   1. Brand / role names that would confuse users ("admin", "support").
 *   2. App routes — if `marc` and `swipe` both existed, /user/swipe
 *      would shadow the discovery page. Belt-and-suspenders defence:
 *      the route is already in the route table, but blocking the
 *      username keeps DM / @-mention copy honest too.
 *
 * Match is exact + case-insensitive (the caller already lowercases).
 * Tracking app routes here means: when we ship a new top-level route,
 * we add it to this list.
 */
export const RESERVED_USERNAMES = new Set<string>([
  // Roles + brand
  'admin',
  'administrator',
  'mod',
  'moderator',
  'owner',
  'staff',
  'support',
  'help',
  'watchly',
  'official',
  'system',
  'root',

  // Auth + account paths
  'api',
  'auth',
  'login',
  'signin',
  'logout',
  'signout',
  'signup',
  'register',
  'verify',
  'verify-email',
  'forgot',
  'forgot-password',
  'reset',
  'reset-password',
  'restore',
  'restore-account',
  'onboarding',

  // Account-shape paths
  'settings',
  'profile',
  'account',
  'user',
  'users',
  'me',
  'you',
  'preferences',

  // Legal / static
  'terms',
  'privacy',
  'security',
  'billing',
  'about',
  'contact',

  // Product surfaces (actual app routes)
  'dashboard',
  'explore',
  'discover',
  'search',
  'for-you',
  'programme',
  'foryou',
  'swipe',
  'favorites',
  'favourites',
  'watchlist',
  'watchlists',
  'activity',
  'notifications',
  'feed',
  'home',
  'docs',
  'debug',
]);
