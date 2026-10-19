import { signUp } from '@/services/auth/signup';
import { handleRoute } from '@/lib/api';
import { setSessionCookie } from '@/utils/server/cookies';
import { limiters } from '@/server/ratelimit';
import { tooManyResponse } from '@/server/ratelimit/response';
import { getClientIp } from '@/server/net/clientIp';

export async function POST(request: Request) {
  const rl = limiters.authSignupByIp.limit(getClientIp(request));
  if (!rl.success) return tooManyResponse(rl.retryAfter);

  return handleRoute(async () => {
    const body = await request.json();
    const { user, sessionToken, sessionExpiresAt } = await signUp(body, { userAgent: request.headers.get('user-agent') });

    await setSessionCookie(sessionToken, sessionExpiresAt);

    return user;
  });
}
