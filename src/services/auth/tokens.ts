import 'server-only';

import crypto from 'node:crypto';
import { db } from '@/db';
import { userVerificationCodes } from '@/db/schema';
import { and, eq, lt, sql } from 'drizzle-orm';

export type TokenPurpose =
  | 'email_verification'
  | 'password_reset'
  | 'account_restore';

interface CreateTokenResult {
  /** Raw token to embed in the email/link — never stored. */
  token: string;
  expiresAt: Date;
}

const TOKEN_BYTES = 32;

function generateRawToken(): string {
  // Base64url so it slots into URLs without encoding.
  return crypto.randomBytes(TOKEN_BYTES).toString('base64url');
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Issue a one-shot token for a specific flow. The raw token is returned
 * once (the caller embeds it in an email link); the database stores only
 * its SHA-256 hash so a row leak is non-exploitable.
 *
 * Any prior unconsumed tokens for the same (userId, purpose) are deleted
 * so the most recent magic link is always the only valid one — clicking
 * an older link in the same flow returns "expired".
 */
export async function createToken(opts: {
  userId: string;
  purpose: TokenPurpose;
  ttlSeconds: number;
}): Promise<CreateTokenResult> {
  const token = generateRawToken();
  const hash = hashToken(token);
  const expiresAt = new Date(Date.now() + opts.ttlSeconds * 1000);

  await db.transaction(async (tx) => {
    // Invalidate any prior tokens for this user+purpose.
    await tx
      .delete(userVerificationCodes)
      .where(
        and(
          eq(userVerificationCodes.userId, opts.userId),
          eq(userVerificationCodes.purpose, opts.purpose),
        ),
      );

    await tx.insert(userVerificationCodes).values({
      userId: opts.userId,
      code: hash,
      purpose: opts.purpose,
      expiresAt,
    });
  });

  return { token, expiresAt };
}

/**
 * Validate + consume a token. Returns the userId on success, null otherwise.
 * Single-use: the row is deleted as part of the same DB call so a captured
 * link can only be redeemed once even in concurrent requests.
 */
export async function consumeToken(opts: {
  token: string;
  purpose: TokenPurpose;
}): Promise<{ userId: string } | null> {
  if (!opts.token) return null;

  const hash = hashToken(opts.token);

  // Atomic consume: DELETE … WHERE hash matches AND not expired, RETURNING.
  // No row → nothing usable matched.
  const rows = await db
    .delete(userVerificationCodes)
    .where(
      and(
        eq(userVerificationCodes.code, hash),
        eq(userVerificationCodes.purpose, opts.purpose),
        sql`${userVerificationCodes.expiresAt} > now()`,
      ),
    )
    .returning({ userId: userVerificationCodes.userId });

  if (rows.length === 0) return null;
  return { userId: rows[0].userId };
}

/**
 * Returns when (if ever) the user most-recently issued a token for this
 * flow. Used by resend-cooldown logic so we can show "Try again in N
 * seconds" instead of letting users spam the send button.
 */
export async function getLatestTokenIssuedAt(opts: {
  userId: string;
  purpose: TokenPurpose;
}): Promise<Date | null> {
  const row = await db.query.userVerificationCodes.findFirst({
    where: and(
      eq(userVerificationCodes.userId, opts.userId),
      eq(userVerificationCodes.purpose, opts.purpose),
    ),
    columns: { createdAt: true },
    orderBy: (t, { desc }) => [desc(t.createdAt)],
  });
  return row?.createdAt ?? null;
}

/**
 * Maintenance helper — drop expired token rows. Safe to run any time; not
 * automatically scheduled, but called opportunistically from token-creating
 * paths to keep the table small.
 */
export async function purgeExpiredTokens(): Promise<void> {
  await db
    .delete(userVerificationCodes)
    .where(lt(userVerificationCodes.expiresAt, sql`now()`));
}
