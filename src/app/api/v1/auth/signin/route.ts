import { signIn } from '@/services/auth/signin';
import { handleRoute } from '@/lib/api';
import { setSessionCookie, setThemeCookie } from '@/utils/server/cookies';
import { limiters } from '@/server/ratelimit';
import { tooManyResponse } from '@/server/ratelimit/response';
import { getClientIp } from '@/server/net/clientIp';

export async function POST(request: Request) {
  const rl = limiters.authSigninByIp.limit(getClientIp(request));
  if (!rl.success) return tooManyResponse(rl.retryAfter);

  return handleRoute(async () => {
    const body = await request.json();
    const { user, regionCode, theme, onboardingCompleted, sessionToken, sessionExpiresAt, persistent } =
      await signIn(body, { userAgent: request.headers.get('user-agent') });

    // Keep the cookie's persistence in sync with the DB session TTL chosen by
    // the service so a "remembered" cookie isn't backed by an expired row.
    await setSessionCookie(sessionToken, sessionExpiresAt, { persistent });

    // Mirror the server-stored theme into a non-httpOnly cookie so the
    // anti-FOUC inline script can resolve the correct class on first paint
    // — even on a device that has never signed in before.
    if (theme) await setThemeCookie(theme);

    return { user, regionCode, theme, onboardingCompleted };
  });
}
