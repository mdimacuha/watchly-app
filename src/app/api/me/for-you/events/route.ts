import type { NextRequest } from 'next/server';
import { handleRoute } from '@/lib/api';
import { getSession } from '@/server/auth/session';
import { limiters } from '@/server/ratelimit';
import { tooManyResponse } from '@/server/ratelimit/response';
import { UnauthorizedAppError } from '@/utils/errors';
import { recordForYouEvents } from '@/services/forYou/events';

/** For You analytics events (signed-in only; /api/me is gated by middleware). */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (session) {
    const rl = limiters.searchEvents.limit(`for-you:${session.userId}`);
    if (!rl.success) return tooManyResponse(rl.retryAfter);
  }
  return handleRoute(async () => {
    if (!session) throw new UnauthorizedAppError();
    const body = await request.json().catch(() => null);
    return recordForYouEvents(session.userId, body);
  });
}
