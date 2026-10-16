import type { NextRequest } from 'next/server';
import { handleRoute } from '@/lib/api';
import { getSession } from '@/server/auth/session';
import { limiters } from '@/server/ratelimit';
import { tooManyResponse } from '@/server/ratelimit/response';
import { getClientIp } from '@/server/net/clientIp';
import { getSearchEndCap } from '@/services/search';

/** Picks shown under search results once they run out (public: guests too). */
export async function GET(request: NextRequest) {
  const session = await getSession();
  const key = session ? `user:${session.userId}` : `ip:${getClientIp(request)}`;
  const rl = limiters.searchEndCap.limit(key);
  if (!rl.success) return tooManyResponse(rl.retryAfter);

  return handleRoute(() =>
    getSearchEndCap(
      session?.userId ?? null,
      Object.fromEntries(request.nextUrl.searchParams),
    ),
  );
}
