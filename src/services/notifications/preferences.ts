import 'server-only';

import { z } from 'zod';
import { db } from '@/db';
import { userPreferences } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { ValidationAppError } from '@/utils/errors';

/**
 * Per-channel notification opt-in/out. Missing keys default to TRUE at
 * read time so the surface is opt-out (matches user expectations — a
 * user who's never visited Settings should still receive notifications).
 *
 * `follow_events` covers follow_request, follow_accepted, follow_back.
 * `follow_activity` is the noisier one (activity from followed users)
 * and gets its own toggle so users can mute it without silencing follows.
 */
export const notificationPrefsSchema = z.object({
  follow_events: z.boolean().optional(),
  follow_activity: z.boolean().optional(),
});

export type NotificationPrefs = z.infer<typeof notificationPrefsSchema>;

export interface ResolvedNotificationPrefs {
  follow_events: boolean;
  follow_activity: boolean;
}

const DEFAULTS: ResolvedNotificationPrefs = {
  follow_events: true,
  follow_activity: true,
};

export async function getNotificationPreferences(
  userId: string,
): Promise<ResolvedNotificationPrefs> {
  const row = await db.query.userPreferences.findFirst({
    where: eq(userPreferences.userId, userId),
    columns: { notificationSettings: true },
  });
  const raw = (row?.notificationSettings ?? {}) as NotificationPrefs;
  return {
    follow_events: raw.follow_events ?? DEFAULTS.follow_events,
    follow_activity: raw.follow_activity ?? DEFAULTS.follow_activity,
  };
}

export async function updateNotificationPreferences(
  userId: string,
  input: NotificationPrefs,
): Promise<ResolvedNotificationPrefs> {
  const parsed = notificationPrefsSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationAppError(
      'Invalid notification preferences',
      parsed.error.flatten(),
    );
  }

  // Merge with the existing object so a partial update doesn't blow away
  // unrelated keys (forwards-compat with future preference additions).
  const existing = await getNotificationPreferences(userId);
  const next: ResolvedNotificationPrefs = { ...existing, ...parsed.data };

  await db
    .update(userPreferences)
    .set({ notificationSettings: next, updatedAt: new Date() })
    .where(eq(userPreferences.userId, userId));

  return next;
}

/**
 * Predicate consulted at fan-out time. Maps the database notification
 * `type` to the relevant preference bucket. Returns true (deliver) when
 * the user is opted in OR when the type isn't gated.
 */
export async function shouldDeliverToUser(
  userId: string,
  type:
    | 'follow_request'
    | 'follow_accepted'
    | 'follow_back'
    | 'follow_activity',
): Promise<boolean> {
  const prefs = await getNotificationPreferences(userId);
  if (
    type === 'follow_request' ||
    type === 'follow_accepted' ||
    type === 'follow_back'
  ) {
    return prefs.follow_events;
  }
  if (type === 'follow_activity') {
    return prefs.follow_activity;
  }
  return true;
}
