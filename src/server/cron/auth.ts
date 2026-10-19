import 'server-only';

import crypto from 'crypto';
import { env } from '@/env';

/**
 * True when the request carries the cron secret (Vercel Cron sends
 * `Authorization: Bearer $CRON_SECRET`). Always false when it isn't
 * configured, so cron routes are closed by default.
 */
export function isCronRequest(request: Request): boolean {
  const secret = env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get('authorization') ?? '');
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}
