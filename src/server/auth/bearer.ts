import 'server-only';
import { getSession } from './session';
import { verifyApiToken } from '@/services/auth/apiTokens';

/**
 * Resolves the requesting user via either:
 *   1. Watchly session cookie (browser-side calls)
 *   2. Authorization: Bearer <token> header (external clients)
 *
 * Returns null when both miss — callers convert to 401.
 */
export async function resolveRequestingUser(
  request: Request,
): Promise<{ userId: string; source: 'session' | 'bearer' } | null> {
  const session = await getSession();
  if (session) {
    return { userId: session.userId, source: 'session' };
  }
  const header = request.headers.get('authorization');
  if (!header) return null;
  const m = /^Bearer\s+(\S+)$/i.exec(header);
  if (!m) return null;
  const result = await verifyApiToken(m[1]);
  if (!result) return null;
  return { userId: result.userId, source: 'bearer' };
}
