import type { NextRequest } from 'next/server';
import { requireUser } from '@/server/auth/requireUser';
import { handleRoute } from '@/lib/api';
import { getServiceChoicesFor } from '@/services/onboarding';

/** The first run's screens step: services to choose from in a region. */
export async function GET(request: NextRequest) {
  return handleRoute(async () => {
    await requireUser();
    return getServiceChoicesFor(request.nextUrl.searchParams.get('region'));
  });
}
