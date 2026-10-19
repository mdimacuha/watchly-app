import { cache } from 'react';
import { db } from '@/db';
import { users, userProfiles, userPreferences } from '@/db/schema';
import { and, eq } from 'drizzle-orm';

/**
 * Request-scoped accessors for the per-user rows that get read repeatedly
 * within a single request (the /me and /user/[username] pages each touch
 * users / user_profiles / user_preferences from several helpers).
 *
 * Wrapping them in React `cache()` collapses those duplicate reads to one
 * DB round-trip per row, per request, without changing any caller's shape
 * or behavior. The cache is per-request and never shared across users.
 */

export const getUserRowById = cache(async (userId: string) => {
  return db.query.users.findFirst({ where: eq(users.id, userId) });
});

/** Non-deleted user by username — lets callers start owner-scoped reads early. */
export const getActiveUserRowByUsername = cache(async (username: string) => {
  return db.query.users.findFirst({
    where: and(eq(users.username, username), eq(users.isDeleted, false)),
  });
});

export const getUserProfileRow = cache(async (userId: string) => {
  return db.query.userProfiles.findFirst({
    where: eq(userProfiles.userId, userId),
  });
});

export const getUserPreferencesRow = cache(async (userId: string) => {
  return db.query.userPreferences.findFirst({
    where: eq(userPreferences.userId, userId),
  });
});
