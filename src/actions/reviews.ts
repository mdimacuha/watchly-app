'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '@/server/auth/session';
import { AppError, UnauthorizedAppError } from '@/utils/errors';
import {
  upsertReview,
  deleteReview,
  getUserReview,
  getReviewAggregate,
  getUserReviews,
  getTitleReviews,
  type ReviewInput,
  type ReviewAggregate,
  type UserReview,
  type EnrichedReview,
  type TitleReview,
} from '@/services/reviews';

// ---------------------------------------------------------------------------
// Server actions for the title review feature (self-only v1). ReviewsSection
// calls these directly. Gated behind FEATURES.reviews at the render site so an
// un-migrated DB is never queried while the flag is off.
// ---------------------------------------------------------------------------

async function requireUserId(): Promise<string> {
  const session = await getSession();
  if (!session) throw new UnauthorizedAppError();
  return session.userId;
}

export interface TitleReviewsPayload {
  aggregate: ReviewAggregate;
  /** The viewer's own review, or null if they haven't reviewed / aren't signed in. */
  mine: UserReview | null;
  /** Public written reviews from other users (excludes the viewer's own). */
  reviews: TitleReview[];
}

export type SaveReviewResult =
  | { ok: true; aggregate: ReviewAggregate; mine: UserReview }
  // Expected validation/moderation failure carrying a safe, user-facing message.
  | { ok: false; error: string };

function revalidateTitle(titleId: string, titleType: string): void {
  revalidatePath(`/title/${titleType}/${titleId}`);
}

/**
 * Reads the aggregate rating for a title plus the current viewer's own review
 * (null when signed out). Safe for unauthenticated callers — only the aggregate
 * is returned in that case.
 */
export async function getReviewsForTitleAction(
  titleId: string,
  titleType: string,
): Promise<TitleReviewsPayload> {
  const session = await getSession();
  const [aggregate, mine, reviews] = await Promise.all([
    getReviewAggregate(titleId, titleType),
    session
      ? getUserReview(session.userId, titleId, titleType)
      : Promise.resolve(null),
    getTitleReviews(titleId, titleType, {
      excludeUserId: session?.userId ?? null,
    }),
  ]);
  return { aggregate, mine, reviews };
}

/**
 * Creates or edits the viewer's review (upsert on the unique index). Returns
 * the refreshed aggregate + saved review on success. Validation/moderation
 * failures come back as `{ ok: false, error }` so the UI can toast a specific
 * message; unexpected errors bubble up.
 */
export async function saveReviewAction(
  titleId: string,
  titleType: string,
  input: ReviewInput,
): Promise<SaveReviewResult> {
  const userId = await requireUserId();
  try {
    const mine = await upsertReview(userId, titleId, titleType, input);
    const aggregate = await getReviewAggregate(titleId, titleType);
    revalidateTitle(titleId, titleType);
    // A new review also lands in the activity feed + the profile — refresh
    // those so it shows up without a hard reload.
    revalidatePath('/activity');
    revalidatePath('/me');
    return { ok: true, aggregate, mine };
  } catch (err) {
    // ValidationAppError (bad rating / body / moderation block) is expected
    // and carries a user-safe message. Anything else is a real server error.
    if (err instanceof AppError && err.statusCode === 400) {
      return { ok: false, error: err.message };
    }
    throw err;
  }
}

/**
 * The current viewer's own reviews, enriched with title/poster, for the
 * profile "Reviews" tab. Requires an authenticated user.
 */
export async function getMyReviewsAction(): Promise<EnrichedReview[]> {
  const userId = await requireUserId();
  return getUserReviews(userId, { limit: 60 });
}

/** Deletes the viewer's review for a title and returns the refreshed aggregate. */
export async function deleteReviewAction(
  titleId: string,
  titleType: string,
): Promise<{ deleted: boolean; aggregate: ReviewAggregate }> {
  const userId = await requireUserId();
  const deleted = await deleteReview(userId, titleId, titleType);
  const aggregate = await getReviewAggregate(titleId, titleType);
  revalidateTitle(titleId, titleType);
  return { deleted, aggregate };
}
