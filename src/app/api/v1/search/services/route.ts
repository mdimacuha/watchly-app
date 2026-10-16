import type { NextRequest } from 'next/server';
import { handleRoute } from '@/lib/api';
import { getSearchServices } from '@/services/search';

/** Streaming services for the search filter, per region (public). */
export async function GET(request: NextRequest) {
  return handleRoute(() => getSearchServices(Object.fromEntries(request.nextUrl.searchParams)));
}
