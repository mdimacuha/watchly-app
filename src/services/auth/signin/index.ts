import { db } from '@/db';
import { users, userSessions } from '@/db/schema';
import { SignInInput, signInSchema } from '@/services/auth/validators';
import { verifyPassword } from '@/utils/server/crypto/password';
import { makeSessionToken } from '@/utils/server/tokens';
import { UnauthorizedAppError } from '@/utils/errors';
import { getUserRegion, getUserTheme, type ThemePreference } from '@/services/preferences';
import { eq, or } from 'drizzle-orm';

// Persistent ("remember me") sessions live for 30 days; non-persistent
// sign-ins get a much shorter DB TTL so the row expires around the time the
// browser discards the session cookie, keeping cookie + DB expiry in sync.
const REMEMBER_ME_TTL_DAYS = 30;
const SESSION_TTL_DAYS = 1;

export async function signIn(input: SignInInput) {
  const { identifier, password, rememberMe } = signInSchema.parse(input);

  // Look up user by email or username
  const user = await db.query.users.findFirst({
    where: or(
      eq(users.email, identifier),
      eq(users.username, identifier)
    ),
  });

  if (!user) {
    throw new UnauthorizedAppError('Invalid credentials');
  }

  // Verify password
  const isValid = verifyPassword(password, user.salt, user.passwordDigest);
  if (!isValid) {
    throw new UnauthorizedAppError('Invalid credentials');
  }

  // Check account status
  if (!user.isActive || user.isSuspended || user.isLocked || user.isDeleted) {
    throw new UnauthorizedAppError('Account is not accessible');
  }

  // Create session. The TTL follows the rememberMe choice; the same flag is
  // returned as `persistent` so the caller sets a matching cookie lifetime.
  const sessionToken = makeSessionToken();
  const ttlDays = rememberMe ? REMEMBER_ME_TTL_DAYS : SESSION_TTL_DAYS;
  const sessionExpiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * ttlDays);

  await db.insert(userSessions).values({
    userId: user.id,
    sessionToken,
    expiresAt: sessionExpiresAt,
  });

  const [regionCode, theme] = await Promise.all([
    getUserRegion(user.id),
    getUserTheme(user.id),
  ]);

  return {
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      avatarUrl: user.avatarUrl,
    },
    regionCode,
    theme: theme satisfies ThemePreference | null,
    sessionToken,
    sessionExpiresAt,
    // When false, the caller sets a browser-session cookie (no expiry) rather
    // than a persistent one, matching the shorter DB session TTL above.
    persistent: rememberMe,
  };
}
