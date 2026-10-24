import type { NextRequest } from 'next/server';
import { handleRoute } from '@/lib/api';
import { getSession } from '@/server/auth/session';
import { limiters } from '@/server/ratelimit';
import { tooManyResponse } from '@/server/ratelimit/response';
import { getClientIp } from '@/server/net/clientIp';
import { searchTaste } from '@/services/onboarding';

/** Taste-step title search (public: the taste step comes before the account). */
export async function GET(request: NextRequest) {
  const session = await getSession();
  const key = session ? `user:${session.userId}` : `ip:${getClientIp(request)}`;
  const rl = limiters.tmdbSearch.limit(key);
  if (!rl.success) return tooManyResponse(rl.retryAfter);

  return handleRoute(() =>
    searchTaste({ q: request.nextUrl.searchParams.get('q'), region: request.nextUrl.searchParams.get('region') }),
  );
}
