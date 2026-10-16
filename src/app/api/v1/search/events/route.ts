import type { NextRequest } from 'next/server';
import { handleRoute } from '@/lib/api';
import { getSession } from '@/server/auth/session';
import { limiters } from '@/server/ratelimit';
import { tooManyResponse } from '@/server/ratelimit/response';
import { getClientIp } from '@/server/net/clientIp';
import { recordSearchEvents } from '@/services/search';

/** Search analytics events (public: guests search too). */
export async function POST(request: NextRequest) {
  const session = await getSession();
  const key = session ? `user:${session.userId}` : `ip:${getClientIp(request)}`;
  const rl = limiters.searchEvents.limit(key);
  if (!rl.success) return tooManyResponse(rl.retryAfter);

  return handleRoute(async () => {
    const body = await request.json().catch(() => null);
    return recordSearchEvents(session?.userId ?? null, body);
  });
}
