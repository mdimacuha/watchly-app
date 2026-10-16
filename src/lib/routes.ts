/**
 * Route collections for middleware and access control.
 *
 * Each array entry is treated as a **prefix** — a request matches if
 * `pathname === route` OR `pathname.startsWith(route + '/')`.
 *
 * Three categories:
 *  • public        – accessible to everyone (no session required)
 *  • authenticated – require a valid session cookie
 *  • devOnly       – only available when NODE_ENV === 'development'
 */

// ---------------------------------------------------------------------------
// Route definitions
// ---------------------------------------------------------------------------

/** Routes that anyone can visit without being signed in. */
export const publicRoutes: string[] = [
  '/',
  '/signin',
  '/signup',
  // /sign-up is a permanent redirect to /signup — needs to stay public so
  // visitors hit the redirect instead of getting bounced by middleware.
  '/sign-up',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
  '/restore-account',
  '/privacy',
  '/terms',
  '/changelogs',
  '/search',
  '/title',
  '/tv',
  '/collection',
  '/artist',
  '/user',
  // /watchlists/[id] — public when the list is public; the list page at
  // /watchlists (no id) guards itself via requireUser() and redirects.
];

/** API routes that don't require a session. */
export const publicApiRoutes: string[] = [
  '/api/v1/auth',
  '/api/geo',
];

/**
 * Auth‑specific public routes — if a user is **already** signed in
 * they will be redirected away from these (e.g. back to `/`).
 */
export const authRoutes: string[] = [
  '/signin',
  '/signup',
  '/sign-up',
];

/** Routes that require the user to be signed in. */
export const authenticatedRoutes: string[] = [
  '/onboarding',
  '/home',
  '/feed',
  '/for-you',
  '/favorites',
  '/me',
  '/activity',
  '/notifications',
  '/settings',
  // /watchlists is intentionally NOT prefix-matched here. The list page
  // (/watchlists) guards itself via requireUser(); the detail page
  // (/watchlists/[id]) is public when the list is public.
];

/** API routes that require a session (returns 401 instead of redirect). */
export const authenticatedApiRoutes: string[] = [
  '/api/me',
];

/** Routes only available in development. */
export const devOnlyRoutes: string[] = [
  '/debug',
  '/docs',
];

// ---------------------------------------------------------------------------
// Matcher helpers
// ---------------------------------------------------------------------------

/**
 * Returns `true` when `pathname` matches any entry in `routes`.
 * Matching is prefix‑based: `/onboarding` matches `/onboarding/welcome`.
 */
export function matchesRoute(pathname: string, routes: string[]): boolean {
  return routes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );
}
