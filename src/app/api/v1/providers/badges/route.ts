import { handleRoute } from '@/lib/api';
import { getSession } from '@/server/auth/session';
import { limiters } from '@/server/ratelimit';
import { tooManyResponse } from '@/server/ratelimit/response';
import { getClientIp } from '@/server/net/clientIp';
import { getCardBadgesForRequest } from '@/services/providers/cardBadges';

/**
 * Availability badges for a batch of titles in one region (≤40). Lets cached
 * pages (collection, artist) show the visitor's own region instead of
 * baking one region into the HTML. POST because each item carries its title
 * and year for the JustWatch fallback. Rate-limited per user / IP: each call
 * fans out to TMDB (and JustWatch).
 */
export async function POST(request: Request) {
  const session = await getSession();
  const key = session ? `user:${session.userId}` : `ip:${getClientIp(request)}`;
  const rl = limiters.cardBadges.limit(key);
  if (!rl.success) return tooManyResponse(rl.retryAfter);
  return handleRoute(async () => getCardBadgesForRequest(await request.json()));
}
