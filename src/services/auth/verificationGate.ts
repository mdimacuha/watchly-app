import 'server-only';

import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { ForbiddenAppError } from '@/utils/errors';

export const VERIFICATION_GRACE_DAYS = 7;
const GRACE_MS = VERIFICATION_GRACE_DAYS * 24 * 60 * 60 * 1000;

export interface VerificationStatus {
  isVerified: boolean;
  /** Milliseconds remaining in the grace period; 0 once exceeded. */
  graceRemainingMs: number;
  /** True if the user is past grace AND not yet verified. */
  isPastGrace: boolean;
}

/**
 * Reads the user's verification status + grace-period state. Surfaces in
 * the UI so we can render a soft banner during grace and a hard one after.
 */
export async function getVerificationStatus(
  userId: string,
): Promise<VerificationStatus> {
  const row = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { isVerified: true, createdAt: true },
  });
  if (!row) {
    return { isVerified: false, graceRemainingMs: 0, isPastGrace: true };
  }
  if (row.isVerified) {
    return {
      isVerified: true,
      graceRemainingMs: Number.MAX_SAFE_INTEGER,
      isPastGrace: false,
    };
  }
  const elapsed = Date.now() - row.createdAt.getTime();
  const remaining = Math.max(0, GRACE_MS - elapsed);
  return {
    isVerified: false,
    graceRemainingMs: remaining,
    isPastGrace: remaining === 0,
  };
}

/**
 * Throws ForbiddenAppError when the user is past grace AND not verified.
 * Call this at the top of any "primary action" service function (add to
 * favorites / add to watchlist / create watchlist / follow). Cheap — one
 * indexed PK lookup.
 */
export async function requireVerifiedOrInGrace(userId: string): Promise<void> {
  const status = await getVerificationStatus(userId);
  if (status.isPastGrace) {
    throw new ForbiddenAppError(
      'Verify your email to continue using Watchly.',
    );
  }
}
