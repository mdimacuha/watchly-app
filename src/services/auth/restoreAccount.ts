import 'server-only';

import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { ValidationAppError } from '@/utils/errors';
import { consumeToken } from './tokens';

/**
 * Consume the account-restore magic-link token and un-delete the user.
 * Single-use: the token is removed atomically. The user must sign in
 * again afterwards — we don't auto-create a session here.
 */
export async function restoreAccount(token: string): Promise<{ userId: string }> {
  if (!token) {
    throw new ValidationAppError('Token is required');
  }

  const consumed = await consumeToken({
    token,
    purpose: 'account_restore',
  });
  if (!consumed) {
    throw new ValidationAppError('Invalid or expired restore link');
  }

  await db
    .update(users)
    .set({
      isDeleted: false,
      isActive: true,
      deletedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, consumed.userId));

  return { userId: consumed.userId };
}
