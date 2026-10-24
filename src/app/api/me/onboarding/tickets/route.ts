import type { NextRequest } from 'next/server';
import { requireUser } from '@/server/auth/requireUser';
import { handleRoute } from '@/lib/api';
import { getFirstTicketsForUser } from '@/services/onboarding';

/**
 * Tonight's first ticket and the ones to swap to. A route rather than a
 * server action: the first call builds the For You pool (seconds), and
 * server actions run one at a time, so it would hold up every step's save.
 */
export async function GET(request: NextRequest) {
  return handleRoute(async () => {
    const userId = await requireUser();
    return getFirstTicketsForUser(userId, request.cookies.get('watchly_region')?.value ?? null);
  });
}
