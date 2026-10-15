import 'server-only';

import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { ValidationAppError } from '@/utils/errors';
import { consumeToken } from './tokens';

/**
 * Consume an email-verification token and flip the user's `isVerified`.
 * Returns the user id on success; throws ValidationAppError on missing /
 * expired / already-consumed token so the route can render a 400-ish
 * message ("This link has expired").
 */
export async function consumeEmailVerification(token: string): Promise<string> {
  const result = await consumeToken({
    token,
    purpose: 'email_verification',
  });
  if (!result) {
    throw new ValidationAppError('Invalid or expired verification link');
  }

  await db
    .update(users)
    .set({ isVerified: true, updatedAt: new Date() })
    .where(eq(users.id, result.userId));

  return result.userId;
}
