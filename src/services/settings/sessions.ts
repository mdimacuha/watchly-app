import { z } from 'zod';
import { and, desc, eq, gt, ne } from 'drizzle-orm';
import { db } from '@/db';
import { userSessions } from '@/db/schema';
import { NotFoundAppError, ValidationAppError } from '@/utils/errors';

// Signed-in devices for Settings → Sessions. Rows are addressed by id only:
// session tokens never leave the server, and every delete is scoped to the
// caller's user id so one user can't end another's session.

export interface SessionListItem {
  id: string;
  /** "Chrome on Windows"; "Unknown device" for sessions from before devices were recorded. */
  device: string;
  /** When this device signed in. */
  signedInAt: string;
  expiresAt: string;
  /** The session making this request. */
  current: boolean;
}

/** Best-effort browser + OS from a user-agent string. Display only. */
export function describeUserAgent(ua: string | null | undefined): string {
  if (!ua) return 'Unknown device';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\/|Opera/.test(ua)
      ? 'Opera'
      : /SamsungBrowser/.test(ua)
        ? 'Samsung Internet'
        : /Firefox\/|FxiOS/.test(ua)
          ? 'Firefox'
          : /Chrome\/|CriOS/.test(ua)
            ? 'Chrome'
            : /Safari\//.test(ua)
              ? 'Safari'
              : null;
  const os = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad/.test(ua)
      ? 'iPad'
      : /Android/.test(ua)
        ? 'Android'
        : /CrOS/.test(ua)
          ? 'ChromeOS'
          : /Windows/.test(ua)
            ? 'Windows'
            : /Mac OS X|Macintosh/.test(ua)
              ? 'Mac'
              : /Linux/.test(ua)
                ? 'Linux'
                : null;
  if (browser && os) return `${browser} on ${os}`;
  return browser ?? os ?? 'Unknown device';
}

/** Live (unexpired) sessions, the current one first, then newest. */
export async function listSessions(userId: string, currentToken: string | null): Promise<SessionListItem[]> {
  const rows = await db
    .select({
      id: userSessions.id,
      token: userSessions.sessionToken,
      userAgent: userSessions.userAgent,
      createdAt: userSessions.createdAt,
      expiresAt: userSessions.expiresAt,
    })
    .from(userSessions)
    .where(and(eq(userSessions.userId, userId), gt(userSessions.expiresAt, new Date())))
    .orderBy(desc(userSessions.createdAt))
    .limit(50);

  return rows
    .map((r) => ({
      id: r.id,
      device: describeUserAgent(r.userAgent),
      signedInAt: r.createdAt.toISOString(),
      expiresAt: r.expiresAt.toISOString(),
      current: !!currentToken && r.token === currentToken,
    }))
    .sort((a, b) => Number(b.current) - Number(a.current));
}

const sessionIdSchema = z.string().uuid();

/** Signs one other device out. The current session is signed out with "Sign out" instead. */
export async function revokeSession(userId: string, sessionId: unknown, currentToken: string | null): Promise<void> {
  const parsed = sessionIdSchema.safeParse(sessionId);
  if (!parsed.success) throw new ValidationAppError('Invalid session');
  const conditions = [eq(userSessions.id, parsed.data), eq(userSessions.userId, userId)];
  if (currentToken) conditions.push(ne(userSessions.sessionToken, currentToken));
  const deleted = await db.delete(userSessions).where(and(...conditions)).returning({ id: userSessions.id });
  if (deleted.length === 0) throw new NotFoundAppError('Session not found');
}

/** Signs every other device out; returns how many. */
export async function revokeOtherSessions(userId: string, currentToken: string | null): Promise<number> {
  const deleted = await db
    .delete(userSessions)
    .where(
      currentToken
        ? and(eq(userSessions.userId, userId), ne(userSessions.sessionToken, currentToken))
        : eq(userSessions.userId, userId),
    )
    .returning({ id: userSessions.id });
  return deleted.length;
}
