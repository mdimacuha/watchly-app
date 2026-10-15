import { db } from '@/db';
import { users, userPreferences, userSessions } from '@/db/schema';
import { and, eq, ne } from 'drizzle-orm';
import { z } from 'zod';
import {
  ValidationAppError,
  UnauthorizedAppError,
  NotFoundAppError,
} from '@/utils/errors';
import { hashPassword, makeSalt, verifyPassword } from '@/utils/server/crypto/password';
import { isEmailExisting } from '@/services/users/helper';
import { logger } from '@/lib/log';

// ---------------------------------------------------------------------------
// Privacy
// ---------------------------------------------------------------------------

export const updatePrivacySchema = z.object({
  profileVisibility: z.enum(['public', 'followers_only', 'private']).optional(),
  watchlistsVisibility: z.enum(['public', 'followers_only', 'private']).optional(),
  hideFavorites: z.boolean().optional(),
  hideWatched: z.boolean().optional(),
});

export type UpdatePrivacyInput = z.infer<typeof updatePrivacySchema>;

export async function getPrivacySettings(userId: string) {
  const row = await db.query.userPreferences.findFirst({
    where: eq(userPreferences.userId, userId),
  });
  return {
    profileVisibility: row?.profileVisibility ?? 'public',
    watchlistsVisibility: row?.watchlistsVisibility ?? 'public',
    hideFavorites: row?.hideFavorites ?? false,
    // Default true — watched data is hidden until the user opts into
    // sharing. The settings UI flips this via a "Show watched on my
    // profile" toggle, which is the inverse of this stored value.
    hideWatched: row?.hideWatched ?? true,
  };
}

export async function updatePrivacy(userId: string, input: UpdatePrivacyInput) {
  const parsed = updatePrivacySchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationAppError('Invalid privacy input', parsed.error.flatten());
  }

  const [row] = await db
    .update(userPreferences)
    .set({
      ...(parsed.data.profileVisibility !== undefined
        ? { profileVisibility: parsed.data.profileVisibility }
        : {}),
      ...(parsed.data.watchlistsVisibility !== undefined
        ? { watchlistsVisibility: parsed.data.watchlistsVisibility }
        : {}),
      ...(parsed.data.hideFavorites !== undefined
        ? { hideFavorites: parsed.data.hideFavorites }
        : {}),
      ...(parsed.data.hideWatched !== undefined
        ? { hideWatched: parsed.data.hideWatched }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(userPreferences.userId, userId))
    .returning();
  return row;
}

// ---------------------------------------------------------------------------
// Appearance / theme
// ---------------------------------------------------------------------------

export const themeSchema = z.enum(['system', 'dark', 'light']);

export type Theme = z.infer<typeof themeSchema>;

export async function getTheme(userId: string): Promise<Theme | null> {
  const row = await db.query.userPreferences.findFirst({
    where: eq(userPreferences.userId, userId),
    columns: { theme: true },
  });
  const v = row?.theme;
  return v === 'system' || v === 'dark' || v === 'light' ? v : null;
}

export async function updateTheme(userId: string, theme: Theme): Promise<void> {
  const parsed = themeSchema.safeParse(theme);
  if (!parsed.success) {
    throw new ValidationAppError('Invalid theme', parsed.error.flatten());
  }
  await db
    .update(userPreferences)
    .set({ theme: parsed.data, updatedAt: new Date() })
    .where(eq(userPreferences.userId, userId));
}

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

export const changeEmailSchema = z.object({
  email: z.string().email('Invalid email'),
  currentPassword: z.string().min(1, 'Current password is required'),
});

export type ChangeEmailInput = z.infer<typeof changeEmailSchema>;

export async function changeEmail(userId: string, input: ChangeEmailInput) {
  const parsed = changeEmailSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationAppError('Invalid email input', parsed.error.flatten());
  }

  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) throw new NotFoundAppError('User not found');

  if (!verifyPassword(parsed.data.currentPassword, user.salt, user.passwordDigest)) {
    throw new UnauthorizedAppError('Incorrect password');
  }

  if (parsed.data.email.toLowerCase() === user.email.toLowerCase()) {
    return user; // no-op
  }

  if (await isEmailExisting(parsed.data.email)) {
    throw new ValidationAppError('Email already in use');
  }

  const [updated] = await db
    .update(users)
    .set({
      email: parsed.data.email,
      isVerified: false, // require re-verification
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))
    .returning();
  return updated;
}

// ---------------------------------------------------------------------------
// Password
// ---------------------------------------------------------------------------

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z
      .string()
      .min(8, 'New password must be at least 8 characters'),
  })
  .refine((v) => v.currentPassword !== v.newPassword, {
    message: 'New password must differ from current',
    path: ['newPassword'],
  });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export async function changePassword(
  userId: string,
  input: ChangePasswordInput,
  /** Optional session token to keep alive (sign other devices out). */
  currentSessionToken?: string,
) {
  const parsed = changePasswordSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationAppError(
      'Invalid password input',
      parsed.error.flatten(),
    );
  }

  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) throw new NotFoundAppError('User not found');

  if (!verifyPassword(parsed.data.currentPassword, user.salt, user.passwordDigest)) {
    throw new UnauthorizedAppError('Incorrect current password');
  }

  const salt = makeSalt();
  const passwordDigest = hashPassword(parsed.data.newPassword, salt);

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ passwordDigest, salt, updatedAt: new Date() })
      .where(eq(users.id, userId));

    // Invalidate every other session for safety.
    await tx
      .delete(userSessions)
      .where(
        currentSessionToken
          ? and(
              eq(userSessions.userId, userId),
              ne(userSessions.sessionToken, currentSessionToken),
            )
          : eq(userSessions.userId, userId),
      );
  });
}

// ---------------------------------------------------------------------------
// Delete account (soft-delete with grace window)
// ---------------------------------------------------------------------------

export const deleteAccountSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
});

export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;

export async function deleteAccount(userId: string, input: DeleteAccountInput) {
  const parsed = deleteAccountSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationAppError('Invalid input', parsed.error.flatten());
  }

  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) throw new NotFoundAppError('User not found');

  if (!verifyPassword(parsed.data.currentPassword, user.salt, user.passwordDigest)) {
    throw new UnauthorizedAppError('Incorrect password');
  }

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({
        isDeleted: true,
        isActive: false,
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    // Invalidate every session.
    await tx.delete(userSessions).where(eq(userSessions.userId, userId));
  });

  // Send the restore link AFTER the soft-delete commits. Email failure
  // does not roll back deletion — the user has already consented. We
  // dynamic-import to avoid a circular service-layer dep when email flows
  // need anything from settings later.
  try {
    const { sendRestoreAccountEmail } = await import('@/services/auth/emailFlows');
    await sendRestoreAccountEmail(userId);
  } catch (err) {
    logger.warn('[deleteAccount] restore email failed', err);
  }
}
