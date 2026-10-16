import type { NextRequest } from 'next/server';
import { handleRoute } from '@/lib/api';
import { getSession } from '@/server/auth/session';
import { limiters } from '@/server/ratelimit';
import { tooManyResponse } from '@/server/ratelimit/response';
import { getClientIp } from '@/server/net/clientIp';
import { recordProfileEvents } from '@/services/profile/events';

/** Profile analytics events (public: guests view profiles too). */
export async function POST(request: NextRequest) {
  const session = await getSession();
  const key = session ? `profile:user:${session.userId}` : `profile:ip:${getClientIp(request)}`;
  const rl = limiters.searchEvents.limit(key);
  if (!rl.success) return tooManyResponse(rl.retryAfter);

  return handleRoute(async () => {
    const body = await request.json().catch(() => null);
    return recordProfileEvents(session?.userId ?? null, body);
  });
}
