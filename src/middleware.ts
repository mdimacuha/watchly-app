import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  authRoutes,
  authenticatedRoutes,
  authenticatedApiRoutes,
  devOnlyRoutes,
  matchesRoute,
} from '@/lib/routes';
import { PATHS, EXTERNAL_PATHS } from '@/lib/app';
import { SESSION_COOKIE } from '@/utils/server/cookies';
import { isBlockedCrawler } from '@/lib/bots';

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessionToken = request.cookies.get(SESSION_COOKIE)?.value;
  const isAuthenticated = !!sessionToken;
  const isDev = process.env.NODE_ENV === 'development';

  // 0. Root route is decoupled from the app — the marketing landing lives on
  //    gowatchly.com. Signed-in users go to their profile; everyone else (incl.
  //    crawlers) is sent to the marketing site. Uses 307 (default), NOT a
  //    permanent 308: the target varies by the auth cookie, so it must never be
  //    browser-cached across login/logout. In development, signed-out users go
  //    to /signin instead so local dev never bounces to the production site.
  if (pathname === '/') {
    if (isAuthenticated) {
      return NextResponse.redirect(new URL(PATHS.ME, request.url));
    }
    return isDev
      ? NextResponse.redirect(new URL(PATHS.AUTH.SIGN_IN, request.url))
      : NextResponse.redirect(EXTERNAL_PATHS.LANDING_URL);
  }

  // 0b. Crawlers that ignore robots.txt — turn away before any page renders,
  //     so a crawl can't fill the ISR cache one title at a time. Social
  //     link previewers are let through (see lib/bots.ts).
  if (!isAuthenticated && isBlockedCrawler(request.headers.get('user-agent'))) {
    return new NextResponse('Crawling is not permitted. See /robots.txt.', {
      status: 403,
      // No CDN caching: the URL is shared with real visitors.
      headers: { 'X-Robots-Tag': 'noindex', 'Cache-Control': 'private, no-store' },
    });
  }

  // 1. Dev-only routes — block in production
  if (matchesRoute(pathname, devOnlyRoutes) && !isDev) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  // 2. Auth pages (signin / signup) — redirect away if already signed in
  if (matchesRoute(pathname, authRoutes) && isAuthenticated) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  // 3. Authenticated page routes — redirect to signin if no session
  if (matchesRoute(pathname, authenticatedRoutes) && !isAuthenticated) {
    const signinUrl = new URL('/signin', request.url);
    // Preserve the original query string too (e.g. ?migration=welcome), so
    // deep-link params survive the round-trip through login instead of being
    // dropped on the redirect.
    signinUrl.searchParams.set('redirect', pathname + request.nextUrl.search);
    return NextResponse.redirect(signinUrl);
  }

  // 4. Authenticated API routes — return 401 JSON instead of redirect
  if (matchesRoute(pathname, authenticatedApiRoutes) && !isAuthenticated) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  // 5. Public routes & public API routes — allow through. Stamp the
  //    pathname on REQUEST headers so server components (notably the
  //    root layout's maintenance gate) can read it via `headers()`.
  //    `NextResponse.next({ request })` forwards rewritten request
  //    headers downstream; response.headers is for the BROWSER and
  //    wouldn't be visible to RSCs.
  const headers = new Headers(request.headers);
  headers.set('x-pathname', pathname);
  return NextResponse.next({ request: { headers } });
}

// ---------------------------------------------------------------------------
// Matcher — skip static assets & Next.js internals
// ---------------------------------------------------------------------------

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml|manifest\\.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff2|txt|xml)$).*)',
  ],
};
