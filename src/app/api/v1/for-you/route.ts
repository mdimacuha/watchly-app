import { cookies } from 'next/headers';
import { handleRoute } from '@/lib/api';
import { resolveRequestingUser } from '@/server/auth/bearer';
import { getUserRegion } from '@/services/preferences';
import { getForYouFeed } from '@/services/forYou';
import { UnauthorizedAppError } from '@/utils/errors';

async function resolveRegion(userId: string): Promise<string> {
  // Same priority as the rest of the app. Bearer-token callers
  // typically don't have a region cookie, so DB pref takes over.
  const cookieStore = await cookies();
  const cookieRegion = cookieStore.get('watchly_region')?.value;
  if (cookieRegion) return cookieRegion;
  try {
    const pref = await getUserRegion(userId);
    if (pref) return pref;
  } catch {
    /* fall through */
  }
  return 'US';
}

/**
 * Public REST counterpart to getForYouFeedAction. Auth via session cookie
 * OR `Authorization: Bearer <token>`. Returns the same shape the server
 * action returns so external clients can mirror the UI.
 */
export async function GET(request: Request) {
  return handleRoute(async () => {
    const user = await resolveRequestingUser(request);
    if (!user) throw new UnauthorizedAppError();

    const region = await resolveRegion(user.userId);
    return getForYouFeed(user.userId, region);
  });
}
