import 'server-only';

import { NextResponse } from 'next/server';

/**
 * Standardized 429 response used by every rate-limited route. Keeps the
 * shape consistent with `lib/api.ts` (`{ success: false, error }`) and
 * sets the `Retry-After` header in seconds so well-behaved clients can
 * back off automatically.
 */
export function tooManyResponse(retryAfterSeconds: number): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: 'Too many requests. Please try again later.',
    },
    {
      status: 429,
      headers: {
        'Retry-After': String(Math.max(1, retryAfterSeconds)),
      },
    },
  );
}
