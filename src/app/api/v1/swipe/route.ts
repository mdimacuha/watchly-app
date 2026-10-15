import { handleRoute } from '@/lib/api';
import { resolveRequestingUser } from '@/server/auth/bearer';
import { UnauthorizedAppError, ValidationAppError } from '@/utils/errors';
import { recordSwipe } from '@/services/swipe';
import { recordSwipeSchema } from '@/services/swipe/validators';
import { limiters } from '@/server/ratelimit';
import { tooManyResponse } from '@/server/ratelimit/response';

/**
 * POST /api/v1/swipe
 *
 * Records a single swipe (liked / passed / saved / opened). When
 * `action === 'saved'` the existing addFavorite flow fires too —
 * subject to the same verification gate as a heart tap on the title
 * page.
 */
export async function POST(request: Request) {
  const user = await resolveRequestingUser(request);
  // Rate-limit BEFORE auth so unauth callers can't probe the endpoint.
  // The key for unauth is intentionally noisy ('anon'); auth uses the
  // user id so the bucket is per-account.
  const rl = limiters.swipeRecord.limit(
    user ? `user:${user.userId}` : 'anon',
  );
  if (!rl.success) return tooManyResponse(rl.retryAfter);

  return handleRoute(async () => {
    if (!user) throw new UnauthorizedAppError();

    const body = await request.json();
    const parsed = recordSwipeSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationAppError(
        'Invalid swipe body',
        parsed.error.flatten(),
      );
    }

    const result = await recordSwipe({
      userId: user.userId,
      ...parsed.data,
    });

    return {
      success: true,
      swipe: {
        tmdbId: parsed.data.tmdbId,
        mediaType: parsed.data.mediaType,
        action: parsed.data.action,
        favoriteAdded: result.favoriteAdded,
      },
    };
  });
}
