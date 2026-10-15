import { cookies } from 'next/headers';

export const SESSION_COOKIE = 'watchly_session';

// Theme cookie matches the localStorage key the anti-FOUC script reads on
// every page load. Setting this on signin makes the user's saved theme
// follow them across devices/browsers without waiting for a JS round-trip.
export const THEME_COOKIE = 'watchly_theme';
// 90 days is long enough that the cookie survives between sessions on a
// shared/idle device but short enough that stale theme state self-clears
// without a manual signout. The server keeps the user's authoritative
// theme in user_preferences.theme and rewrites the cookie on every signin.
const THEME_COOKIE_MAX_AGE_DAYS = 90;

export async function setSessionCookie(
  token: string,
  expiresAt: Date,
  options?: { persistent?: boolean }
) {
  // Default true so existing callers (e.g. signup) keep the persistent,
  // 30-day cookie behavior unchanged. When false, omit expires/maxAge to make
  // this a session cookie the browser discards on close — the signin service
  // pairs that with a correspondingly shorter DB session expiry.
  const persistent = options?.persistent ?? true;
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    ...(persistent ? { expires: expiresAt } : {}),
    path: '/',
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    expires: new Date(0),
    path: '/',
  });
}

export async function getSessionCookie() {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE)?.value ?? null;
}

/**
 * Set the theme preference cookie. Readable by the anti-FOUC inline
 * script (NOT httpOnly) — needs to be visible to client JS so first-paint
 * resolves the right class on <html>.
 */
export async function setThemeCookie(theme: 'system' | 'dark' | 'light') {
  const cookieStore = await cookies();
  cookieStore.set(THEME_COOKIE, theme, {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: THEME_COOKIE_MAX_AGE_DAYS * 24 * 60 * 60,
    path: '/',
  });
}

export async function clearThemeCookie() {
  const cookieStore = await cookies();
  cookieStore.set(THEME_COOKIE, '', {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    expires: new Date(0),
    path: '/',
  });
}
