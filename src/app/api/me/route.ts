import { NextResponse } from 'next/server';
import { getSessionWithUser } from '@/server/auth/session';
import { getAccentColorFor } from '@/services/profile/accentCache';
import { db } from '@/db';
import { userPreferences } from '@/db/schema';
import { eq } from 'drizzle-orm';
import {
  clearSessionCookie,
  clearThemeCookie,
  getSessionCookie,
} from '@/utils/server/cookies';
import type { AuthUser } from '@/types/auth';

export async function GET() {
  const result = await getSessionWithUser();

  if (!result) {
    // Self-heal: if the request carried a session cookie that no longer
    // resolves to a valid session row (expired, deleted, password reset
    // wiped them, etc.), clear it. Otherwise the middleware keeps
    // believing the user is signed in and bounces them between authed
    // pages and /signin in an infinite loop. The AuthHydrator hits this
    // endpoint on every page load, so the cleanup happens automatically.
    const staleCookie = await getSessionCookie();
    if (staleCookie) {
      await clearSessionCookie();
      await clearThemeCookie();
    }
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const { user } = result;

  // Region pref + accent are both read here so the client stores hydrate from a
  // single /api/me round-trip. `getAccentColorFor` is unstable_cache'd, so the
  // added lookup is near-free and lets the public shell apply the accent
  // client-side (keeping the public layout static / ISR-cacheable).
  const [prefs, accentColor] = await Promise.all([
    db.query.userPreferences.findFirst({
      where: eq(userPreferences.userId, user.id),
    }),
    getAccentColorFor(user.id),
  ]);

  const safeUser: AuthUser = {
    id: user.id,
    username: user.username,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    avatarUrl: user.avatarUrl,
    accentColor,
  };

  return NextResponse.json({
    success: true,
    data: {
      user: safeUser,
      regionCode: prefs?.regionCode ?? null,
    },
  });
}
