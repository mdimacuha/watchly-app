import 'server-only';

import { z } from 'zod';
import { db } from '@/db';
import { users, userSessions } from '@/db/schema';
import { eq } from 'drizzle-orm';
import {
  ValidationAppError,
  NotFoundAppError,
} from '@/utils/errors';
import { hashPassword, makeSalt } from '@/utils/server/crypto/password';
import { consumeToken } from './tokens';

// Same minimum as signup. Worth keeping in sync via a shared schema later.
export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
});

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

/**
 * Validate the magic-link token, set the new password, invalidate every
 * other session. Single-use: token is deleted atomically.
 *
 * Returns the userId so the caller can also clear the user's current
 * session cookie if they want a "you're signed out, sign in with new pw"
 * UX — but we don't enforce that here.
 */
export async function resetPassword(
  input: ResetPasswordInput,
): Promise<{ userId: string }> {
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationAppError(
      'Invalid reset input',
      parsed.error.flatten(),
    );
  }

  const consumed = await consumeToken({
    token: parsed.data.token,
    purpose: 'password_reset',
  });
  if (!consumed) {
    throw new ValidationAppError('Invalid or expired reset link');
  }

  const salt = makeSalt();
  const digest = hashPassword(parsed.data.newPassword, salt);

  await db.transaction(async (tx) => {
    // Update password.
    const result = await tx
      .update(users)
      .set({
        passwordDigest: digest,
        salt,
        updatedAt: new Date(),
      })
      .where(eq(users.id, consumed.userId))
      .returning({ id: users.id });
    if (result.length === 0) {
      throw new NotFoundAppError('User not found');
    }

    // Invalidate every session — the user must sign in again with the
    // new password on every device. (We don't have a "current session id"
    // here since reset can be done while logged out.)
    await tx
      .delete(userSessions)
      .where(eq(userSessions.userId, consumed.userId));
  });

  return { userId: consumed.userId };
}
