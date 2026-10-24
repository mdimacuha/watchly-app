import 'server-only';

import { db } from '@/db';
import { users } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { logger } from '@/lib/log';
import { ValidationAppError } from '@/utils/errors';
import { consumeToken } from './tokens';
import { sendWelcomeEmail } from './emailFlows';

/**
 * Consume an email-verification token and flip the user's `isVerified`,
 * stamping `verifiedAt`. The first time an account is verified, the
 * welcome email goes out. Returns the user id on success; throws
 * ValidationAppError on missing / expired / already-consumed token so the
 * page can say "This link has expired".
 */
export async function consumeEmailVerification(token: string): Promise<string> {
  const result = await consumeToken({
    token,
    purpose: 'email_verification',
  });
  if (!result) {
    throw new ValidationAppError('Invalid or expired verification link');
  }

  // Only the update that flips the flag sends the welcome, so a second
  // verification (a new link after an old one) can't send it twice.
  const flipped = await db
    .update(users)
    .set({ isVerified: true, verifiedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(users.id, result.userId), eq(users.isVerified, false)))
    .returning({ id: users.id });

  if (flipped.length) {
    await sendWelcomeEmail(result.userId).catch((err) => {
      logger.warn('[verify] welcome email failed', err);
    });
  }

  return result.userId;
}
