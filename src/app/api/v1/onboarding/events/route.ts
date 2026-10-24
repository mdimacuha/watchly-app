import type { NextRequest } from 'next/server';
import { handleRoute } from '@/lib/api';
import { getSession } from '@/server/auth/session';
import { limiters } from '@/server/ratelimit';
import { tooManyResponse } from '@/server/ratelimit/response';
import { getClientIp } from '@/server/net/clientIp';
import { recordOnboardingEvents } from '@/services/onboarding';

/** First-run funnel events (public: guests log the taste step). */
export async function POST(request: NextRequest) {
  const session = await getSession();
  const key = session ? `user:${session.userId}` : `ip:${getClientIp(request)}`;
  const rl = limiters.onboardingEvents.limit(key);
  if (!rl.success) return tooManyResponse(rl.retryAfter);

  return handleRoute(async () => {
    const body = await request.json().catch(() => null);
    return recordOnboardingEvents(session?.userId ?? null, body);
  });
}
