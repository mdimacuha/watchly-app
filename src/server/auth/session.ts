import { cache } from 'react';
import { db } from '@/db';
import { users, userSessions } from '@/db/schema';
import { getSessionCookie } from '@/utils/server/cookies';
import { eq } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SessionRow = typeof userSessions.$inferSelect;
type UserRow = typeof users.$inferSelect;

/** User row without secret credential fields — never loaded for session reads. */
export type SafeUserRow = Omit<UserRow, 'passwordDigest' | 'salt'>;

export type Session = SessionRow;
export type SessionWithUser = { session: SessionRow; user: SafeUserRow };

// ---------------------------------------------------------------------------
// Reusable session helpers — use in Server Components, Route Handlers, or
// service functions. These read the cookie via `next/headers` and validate
// against the database.
//
// Both helpers are wrapped in React `cache()` so repeated calls within the
// same request (layout + page + server action) reuse a single DB round-trip.
// The cache is per-request and is not shared across users or requests.
// ---------------------------------------------------------------------------

/**
 * Returns the current session row if the cookie is present, the token exists
 * in the DB, and the session has not expired. Returns `null` otherwise.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  const sessionToken = await getSessionCookie();
  if (!sessionToken) return null;

  const session = await db.query.userSessions.findFirst({
    where: eq(userSessions.sessionToken, sessionToken),
  });

  if (!session) return null;

  if (new Date() > session.expiresAt) return null;

  return session;
});

/**
 * Like `getSession` but also fetches the associated user row.
 * Returns `null` when there is no valid session or the user doesn't exist.
 * The user row excludes `passwordDigest`/`salt` — credential checks must load
 * the user explicitly elsewhere.
 */
export const getSessionWithUser = cache(
  async (): Promise<SessionWithUser | null> => {
    const session = await getSession();
    if (!session) return null;

    const user = await db.query.users.findFirst({
      where: eq(users.id, session.userId),
      columns: { passwordDigest: false, salt: false },
    });

    if (!user) return null;

    return { session, user };
  }
);
