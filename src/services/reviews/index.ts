import 'server-only';

import { z } from 'zod';
import { and, desc, eq, isNotNull, ne, sql } from 'drizzle-orm';
import { db } from '@/db';
import { userReviews, users, userProfiles } from '@/db/schema';
import { ValidationAppError } from '@/utils/errors';
import { moderateText } from '@/services/moderation/contentModeration';
import { recordActivity } from '@/services/activity/record';
import { tmdbFetch } from '@/server/tmdb/client';
import { mapWithConcurrency } from '@/lib/concurrency';

// ---------------------------------------------------------------------------
// Title reviews (rating + optional written review) — self-only v1.
//
// One review per (user, title, type), enforced by the
// `user_reviews_user_title_unique_idx` unique index. Editing is an UPDATE of
// the same row (onConflictDoUpdate) so a user can never stack duplicates.
//
// titleId/titleType are text ('movie' | 'tv') mirroring titleSwipes /
// userFavorites, so the same composite key joins across taste-signal tables.
// ---------------------------------------------------------------------------

export const REVIEW_BODY_MAX_LENGTH = 4000;

export type ReviewTitleType = 'movie' | 'tv';

export interface ReviewInput {
  rating: number;
  body?: string | null;
}

export interface UserReview {
  id: string;
  titleId: string;
  titleType: ReviewTitleType;
  rating: number;
  /** null when the user left a rating only. */
  body: string | null;
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

export interface ReviewAggregate {
  /** Mean rating rounded to one decimal, or null when there are no reviews. */
  average: number | null;
  count: number;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const titleTypeSchema = z.enum(['movie', 'tv']);

const reviewInputSchema = z.object({
  rating: z.number().int().min(1).max(5),
  body: z
    .string()
    .max(REVIEW_BODY_MAX_LENGTH)
    .nullable()
    .optional()
    // Trim and collapse an empty/whitespace-only body to null so a
    // rating-only review is stored consistently.
    .transform((v) => {
      if (v == null) return null;
      const trimmed = v.trim();
      return trimmed.length === 0 ? null : trimmed;
    }),
});

function parseTitleType(titleType: string): ReviewTitleType {
  const parsed = titleTypeSchema.safeParse(titleType);
  if (!parsed.success) {
    throw new ValidationAppError('Invalid title type', parsed.error.flatten());
  }
  return parsed.data;
}

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

interface ReviewRow {
  id: string;
  titleId: string;
  titleType: string;
  rating: number;
  body: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const reviewColumns = {
  id: userReviews.id,
  titleId: userReviews.titleId,
  titleType: userReviews.titleType,
  rating: userReviews.rating,
  body: userReviews.body,
  createdAt: userReviews.createdAt,
  updatedAt: userReviews.updatedAt,
} as const;

function mapReview(row: ReviewRow): UserReview {
  return {
    id: row.id,
    titleId: row.titleId,
    titleType: row.titleType === 'tv' ? 'tv' : 'movie',
    rating: row.rating,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Write paths
// ---------------------------------------------------------------------------

/**
 * Creates or updates the viewer's review for a title. Upserts by
 * (userId, titleId, titleType) so a second submission edits the same row
 * rather than creating a duplicate.
 *
 * When a written body is present it's run through the shared content
 * moderation filter (length + profanity + slurs). Rating-only reviews skip
 * moderation. The rejection message is intentionally generic and safe to
 * surface to the user.
 */
export async function upsertReview(
  userId: string,
  titleId: string,
  titleType: string,
  input: ReviewInput,
): Promise<UserReview> {
  const type = parseTitleType(titleType);

  const parsed = reviewInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationAppError('Invalid review', parsed.error.flatten());
  }
  const { rating, body } = parsed.data;

  if (body) {
    const verdict = moderateText(body, {
      allowEmpty: true,
      maxLength: REVIEW_BODY_MAX_LENGTH,
    });
    if (!verdict.allowed) {
      throw new ValidationAppError(
        verdict.message ?? 'This content is not allowed.',
      );
    }
  }

  // Detect first-time review vs edit so we log an activity event once (when
  // the user first reviews a title), not on every subsequent edit.
  const existing = await db
    .select({ id: userReviews.id })
    .from(userReviews)
    .where(
      and(
        eq(userReviews.userId, userId),
        eq(userReviews.titleId, titleId),
        eq(userReviews.titleType, type),
      ),
    )
    .limit(1);
  const isNewReview = existing.length === 0;

  const now = new Date();
  const [row] = await db
    .insert(userReviews)
    .values({
      userId,
      titleId,
      titleType: type,
      rating,
      body,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        userReviews.userId,
        userReviews.titleId,
        userReviews.titleType,
      ],
      set: {
        rating,
        body,
        updatedAt: now,
      },
    })
    .returning(reviewColumns);

  if (isNewReview) {
    // recordActivity swallows its own errors — a feed hiccup must never
    // fail the review write.
    await recordActivity(userId, {
      type: 'review',
      payload: { mediaType: type, mediaId: titleId, rating },
    });
  }

  return mapReview(row);
}

/** Removes the viewer's review for a title. Returns true when a row was deleted. */
export async function deleteReview(
  userId: string,
  titleId: string,
  titleType: string,
): Promise<boolean> {
  const type = parseTitleType(titleType);
  const deleted = await db
    .delete(userReviews)
    .where(
      and(
        eq(userReviews.userId, userId),
        eq(userReviews.titleId, titleId),
        eq(userReviews.titleType, type),
      ),
    )
    .returning({ id: userReviews.id });
  return deleted.length > 0;
}

// ---------------------------------------------------------------------------
// Read paths
// ---------------------------------------------------------------------------

/** Returns the viewer's own review for a title, or null if they have none. */
export async function getUserReview(
  userId: string,
  titleId: string,
  titleType: string,
): Promise<UserReview | null> {
  const type = parseTitleType(titleType);
  const [row] = await db
    .select(reviewColumns)
    .from(userReviews)
    .where(
      and(
        eq(userReviews.userId, userId),
        eq(userReviews.titleId, titleId),
        eq(userReviews.titleType, type),
      ),
    )
    .limit(1);
  return row ? mapReview(row) : null;
}

/**
 * Aggregate rating for a title across all users: mean (1 decimal) + count.
 * `average` is null when the title has no reviews yet.
 */
export async function getReviewAggregate(
  titleId: string,
  titleType: string,
): Promise<ReviewAggregate> {
  const type = parseTitleType(titleType);
  const [agg] = await db
    .select({
      // Postgres avg() returns numeric (string) and count() returns bigint
      // (string) over the pg driver — coerced to numbers below.
      average: sql<string | null>`avg(${userReviews.rating})`,
      count: sql<string>`count(*)`,
    })
    .from(userReviews)
    .where(
      and(
        eq(userReviews.titleId, titleId),
        eq(userReviews.titleType, type),
      ),
    );

  const count = Number(agg?.count ?? 0);
  const avgRaw = agg?.average != null ? Number(agg.average) : null;
  const average =
    avgRaw != null && !Number.isNaN(avgRaw)
      ? Math.round(avgRaw * 10) / 10
      : null;

  return { average, count };
}

// ---------------------------------------------------------------------------
// Enriched list (for the profile "Reviews" tab)
// ---------------------------------------------------------------------------

/** A review joined with the minimum TMDB fields the profile grid renders. */
export interface EnrichedReview extends UserReview {
  title: string;
  year: number | null;
  posterPath: string | null;
}

const REVIEWS_LIST_DEFAULT_LIMIT = 24;
const REVIEWS_LIST_MAX_LIMIT = 60;

// ---------------------------------------------------------------------------
// Public community reviews (written reviews + author, shown on the title page)
// ---------------------------------------------------------------------------

export interface ReviewAuthor {
  username: string;
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
}

export interface TitleReview {
  id: string;
  rating: number;
  /** Always present — this list only includes reviews with written text. */
  body: string;
  createdAt: string; // ISO
  updatedAt: string; // ISO
  author: ReviewAuthor;
}

const TITLE_REVIEWS_DEFAULT_LIMIT = 20;
const TITLE_REVIEWS_MAX_LIMIT = 50;

/**
 * Written reviews for a title (body present), newest-edited first, joined with
 * the author's public identity. Reviews from soft-deleted accounts are
 * excluded; `excludeUserId` drops the viewer's own review (it's shown in the
 * editor above the list). Bodies were moderated on write, so they're safe to
 * surface publicly.
 */
export async function getTitleReviews(
  titleId: string,
  titleType: string,
  opts: { limit?: number; excludeUserId?: string | null } = {},
): Promise<TitleReview[]> {
  const type = parseTitleType(titleType);
  const limit = Math.min(
    Math.max(opts.limit ?? TITLE_REVIEWS_DEFAULT_LIMIT, 1),
    TITLE_REVIEWS_MAX_LIMIT,
  );

  const conditions = [
    eq(userReviews.titleId, titleId),
    eq(userReviews.titleType, type),
    isNotNull(userReviews.body),
    eq(users.isDeleted, false),
  ];
  if (opts.excludeUserId) {
    conditions.push(ne(userReviews.userId, opts.excludeUserId));
  }

  const rows = await db
    .select({
      id: userReviews.id,
      rating: userReviews.rating,
      body: userReviews.body,
      createdAt: userReviews.createdAt,
      updatedAt: userReviews.updatedAt,
      username: users.username,
      firstName: users.firstName,
      lastName: users.lastName,
      usersAvatarUrl: users.avatarUrl,
      displayName: userProfiles.displayName,
      profileAvatarUrl: userProfiles.avatarUrl,
    })
    .from(userReviews)
    .innerJoin(users, eq(users.id, userReviews.userId))
    .leftJoin(userProfiles, eq(userProfiles.userId, userReviews.userId))
    .where(and(...conditions))
    .orderBy(desc(userReviews.updatedAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    rating: r.rating,
    body: r.body ?? '',
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    author: {
      username: r.username,
      displayName: r.displayName,
      firstName: r.firstName,
      lastName: r.lastName,
      avatarUrl: r.profileAvatarUrl ?? r.usersAvatarUrl ?? null,
    },
  }));
}

/**
 * The user's own reviews, newest-edited first, enriched with title/year/poster
 * from TMDB. Enrichment is a bounded, concurrency-capped fan-out of cheap
 * detail fetches (tmdbFetch is server-cached ~1h); a failed lookup degrades to
 * a poster-less row rather than dropping the review.
 */
export async function getUserReviews(
  userId: string,
  opts: { limit?: number } = {},
): Promise<EnrichedReview[]> {
  const limit = Math.min(
    Math.max(opts.limit ?? REVIEWS_LIST_DEFAULT_LIMIT, 1),
    REVIEWS_LIST_MAX_LIMIT,
  );

  const rows = await db
    .select(reviewColumns)
    .from(userReviews)
    .where(eq(userReviews.userId, userId))
    .orderBy(desc(userReviews.updatedAt))
    .limit(limit);

  return mapWithConcurrency(rows, 6, async (r) => {
    const review = mapReview(r);
    let title = '';
    let year: number | null = null;
    let posterPath: string | null = null;
    try {
      const raw = await tmdbFetch<{
        title?: string;
        name?: string;
        poster_path?: string | null;
        release_date?: string;
        first_air_date?: string;
      }>(`/${review.titleType}/${review.titleId}`);
      title = (review.titleType === 'movie' ? raw.title : raw.name) ?? '';
      posterPath = raw.poster_path ?? null;
      const date =
        review.titleType === 'movie' ? raw.release_date : raw.first_air_date;
      year = date ? new Date(date).getFullYear() : null;
    } catch {
      // Degrade gracefully — keep the row so the user still sees the review.
    }
    return { ...review, title, year, posterPath };
  });
}
