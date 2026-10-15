import { redirect } from 'next/navigation';
import { getSession } from '@/server/auth/session';

/**
 * Validates the session cookie and returns the current user ID.
 * If the session is invalid or expired, redirects to the sign-in page.
 *
 * Use in Server Components or Route Handlers where you need a guaranteed
 * authenticated user. For cases where you want `null` instead of a redirect,
 * use `getSession()` or `getSessionWithUser()` from `@/server/auth/session`.
 */
export async function requireUser() {
  const session = await getSession();

  if (!session) {
    redirect('/signin');
  }

  return session.userId;
}
