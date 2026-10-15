import { db } from '@/db';
import {
  users,
  userSessions,
  userPreferences,
  userProfiles,
  watchlists,
} from '@/db/schema';
import { DEFAULT_WATCHLIST_NAME } from '@/services/watchlists';
import { SignUpInput, signUpSchema } from '@/services/auth/validators';
import { makeSalt, hashPassword } from '@/utils/server/crypto/password';
import { makeSessionToken } from '@/utils/server/tokens';
import { isEmailExisting, isUsernameExisting } from '@/services/users/helper';
import { ValidationAppError } from '@/utils/errors';
import { sendVerificationEmail, sendWelcomeEmail } from '@/services/auth/emailFlows';
import { logger } from '@/lib/log';
import { validateUsername } from '@/services/moderation/validateUsername';
import { moderateText } from '@/services/moderation/contentModeration';

export async function signUp(input: SignUpInput) {
  const inputData = signUpSchema.parse(input);

  // Strict username pipeline: format → reserved → profanity / racial
  // slur. Lives outside the Zod schema so we can return a single
  // user-friendly message rather than a regex error code.
  const usernameValidation = validateUsername(inputData.username);
  if (!usernameValidation.valid) {
    // Internal reason is logged so we can spot abuse patterns; the
    // external message stays whatever validateUsername gave back
    // (already sanitised for offensive matches).
    logger.warn('[signup] username rejected', {
      reason: usernameValidation.reason,
    });
    throw new ValidationAppError(
      usernameValidation.message ?? 'This username is not allowed.',
    );
  }
  const normalizedUsername = usernameValidation.normalizedUsername!;

  // First / last name aren't usernames, but they're public-facing on
  // /me and /user/* — run them through the same moderation gate so
  // slurs can't sneak in via the name field. Length bounds already
  // enforced by the Zod schema (1-50).
  for (const [field, value] of [
    ['firstName', inputData.firstName],
    ['lastName', inputData.lastName],
  ] as const) {
    const m = moderateText(value, { minLength: 1, maxLength: 50 });
    if (!m.allowed) {
      logger.warn('[signup] name rejected', { field, reason: m.reason });
      throw new ValidationAppError(
        m.reason === 'profanity' || m.reason === 'racial_offensive'
          ? 'This name is not allowed.'
          : m.message ?? 'This name is not allowed.',
      );
    }
  }

  const isEmailExistingRes = await isEmailExisting(inputData.email);
  if (isEmailExistingRes) {
    throw new ValidationAppError('An account with this email already exists.');
  }

  const isUsernameExistingRes = await isUsernameExisting(normalizedUsername);
  if (isUsernameExistingRes) {
    throw new ValidationAppError('This username is already taken.');
  }

  const salt = makeSalt();
  const passwordDigest = hashPassword(inputData.password, salt);

  const sessionToken = makeSessionToken();
  const sessionExpiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30); // 30 days

  const createdUser = await db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({
        email: inputData.email,
        // Use the normalized form (lowercase, trimmed) — `inputData.username`
        // is already lowercased by the schema but normalizedUsername is the
        // explicit post-validation copy from validateUsername().
        username: normalizedUsername,
        passwordDigest,
        salt,
        firstName: inputData.firstName,
        lastName: inputData.lastName,
        avatarUrl: '',
        isVerified: false,
      })
      .returning({
        id: users.id,
        email: users.email,
        username: users.username,
        firstName: users.firstName,
        lastName: users.lastName,
      });

    await tx.insert(userPreferences).values({
      userId: user.id,
      regionCode: 'unknown',
      regionSource: 'unknown',
      onboardingCompleted: false,
      onboardingCompletedAt: null,
      profileVisibility: 'public',
      watchlistsVisibility: 'public',
    });

    await tx.insert(userProfiles).values({
      userId: user.id,
      displayName: user.username,
      bio: '',
      avatarUrl: '',
    });

    await tx.insert(userSessions).values({
      userId: user.id,
      sessionToken,
      expiresAt: sessionExpiresAt,
    });

    await tx.insert(watchlists).values({
      userId: user.id,
      name: DEFAULT_WATCHLIST_NAME,
    });

    return { user, sessionToken, sessionExpiresAt };
  });

  // Fire transactional + marketing emails outside the transaction —
  // email failure shouldn't roll back user creation. Sent in parallel
  // because they're independent; both swallow errors so neither one
  // failing can take the other down.
  await Promise.all([
    sendVerificationEmail(createdUser.user.id).catch((err) => {
      logger.warn('[signup] verification email failed', err);
    }),
    sendWelcomeEmail(createdUser.user.id).catch((err) => {
      logger.warn('[signup] welcome email failed', err);
    }),
  ]);

  return createdUser;
}
