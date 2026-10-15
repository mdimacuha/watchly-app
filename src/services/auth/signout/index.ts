import { db } from '@/db';
import { userSessions } from '@/db/schema';
import { getSessionCookie } from '@/utils/server/cookies';
import { eq } from 'drizzle-orm';

/**
 * Deletes the current session row from the database.
 * The cookie is cleared separately in the route handler.
 */
export async function signOut() {
  const sessionToken = await getSessionCookie();

  if (sessionToken) {
    await db
      .delete(userSessions)
      .where(eq(userSessions.sessionToken, sessionToken));
  }
}
