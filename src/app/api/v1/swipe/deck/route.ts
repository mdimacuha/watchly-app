import { handleRoute } from '@/lib/api';
import { resolveRequestingUser } from '@/server/auth/bearer';
import { UnauthorizedAppError, ValidationAppError } from '@/utils/errors';
import { getSwipeDeck } from '@/services/swipe';
import { getSwipeDeckQuerySchema } from '@/services/swipe/validators';
import { limiters } from '@/server/ratelimit';
import { tooManyResponse } from '@/server/ratelimit/response';
import { getClientIp } from '@/server/net/clientIp';

/**
 * GET /api/v1/swipe/deck
 *
 * Returns a personalised swipe deck. Auth via session cookie or
 * `Authorization: Bearer <token>` (matches /api/v1/for-you so external
 * clients can use the same key flow).
 */
export async function GET(request: Request) {
  const user = await resolveRequestingUser(request);
  const rl = limiters.swipeDeck.limit(
    user ? `user:${user.userId}` : `ip:${getClientIp(request)}`,
  );
  if (!rl.success) return tooManyResponse(rl.retryAfter);

  return handleRoute(async () => {
    if (!user) throw new UnauthorizedAppError();

    const url = new URL(request.url);
    const parsed = getSwipeDeckQuerySchema.safeParse(
      Object.fromEntries(url.searchParams),
    );
    if (!parsed.success) {
      throw new ValidationAppError(
        'Invalid swipe deck query',
        parsed.error.flatten(),
      );
    }

    return getSwipeDeck(user.userId, parsed.data);
  });
}
