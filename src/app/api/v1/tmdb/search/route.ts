import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/server/auth/session';
import { searchContent } from '@/services/tmdb';
import { SearchResponse } from '@/types/tmdb';
import { logger } from '@/lib/log';
import { limiters } from '@/server/ratelimit';
import { tooManyResponse } from '@/server/ratelimit/response';
import { getClientIp } from '@/server/net/clientIp';

export async function GET(request: NextRequest) {
  try {
    // Key by userId when signed in (survives IP shifts on the same
    // account), fall back to IP for unauthenticated visitors. Search
    // fans out to many TMDB calls per query — keeping this bucket
    // tight (30 req / min) protects the upstream quota.
    const session = await getSession();
    const key = session
      ? `user:${session.userId}`
      : `ip:${getClientIp(request)}`;
    const rl = limiters.tmdbSearch.limit(key);
    if (!rl.success) return tooManyResponse(rl.retryAfter);

    const searchParams = request.nextUrl.searchParams;

    const params = {
      q: searchParams.get('q') || undefined,
      type: (searchParams.get('type') as 'all' | 'movie' | 'tv') || 'all',
      year: searchParams.get('year') || undefined,
      genre: searchParams.get('genre') || undefined,
      service: searchParams.get('service') || undefined,
      page: searchParams.get('page') || '1',
      region: searchParams.get('region') || undefined,
    };

    const response: SearchResponse = await searchContent(params, session?.userId);

    // Results vary by region/user (provider personalization), so cache only
    // in the user's own browser — never in a shared/CDN cache.
    return NextResponse.json(response, {
      headers: { 'Cache-Control': 'private, max-age=300' },
    });
  } catch (error: unknown) {
    logger.error('Search API Error', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
