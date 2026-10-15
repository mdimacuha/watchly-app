import { db } from '@/db';
import {
  activities,
  notifications,
  userFollows,
  userPreferences,
} from '@/db/schema';
import { sql } from 'drizzle-orm';
import { logger } from '@/lib/log';

// Payload shapes per event kind — kept narrow so payload reads at query time
// can rely on the shape without runtime guards. Mirrors `ActivityItem`
// kinds in `./types`.

type FavoritePayload = {
  mediaType: 'movie' | 'tv' | 'collection' | 'artist';
  mediaId: string;
};

type WatchlistAddPayload = {
  watchlistId: string;
  watchlistName: string;
  mediaType: 'movie' | 'tv';
  mediaId: string;
};

type WatchlistBulkAddPayload = {
  watchlistId: string;
  watchlistName: string;
  count: number;
};

type WatchlistCreatePayload = {
  watchlistId: string;
  watchlistName: string;
};

type RegionUpdatePayload = {
  regionName: string;
};

type ReviewPayload = {
  mediaType: 'movie' | 'tv';
  mediaId: string;
  rating: number;
};

export type RecordableActivity =
  | { type: 'favorite'; payload: FavoritePayload }
  | { type: 'watchlist_add'; payload: WatchlistAddPayload }
  | { type: 'watchlist_bulk_add'; payload: WatchlistBulkAddPayload }
  | { type: 'watchlist_create'; payload: WatchlistCreatePayload }
  | { type: 'region_update'; payload: RegionUpdatePayload }
  | { type: 'review'; payload: ReviewPayload };

/**
 * Record an activity event. `actorId` defaults to `userId` for action events;
 * pass `actorId: null` explicitly for system events (e.g. region_update).
 *
 * Failures are swallowed — activity is a side effect of the primary action
 * and must never break it. Errors are logged for observability.
 */
export async function recordActivity(
  userId: string,
  event: RecordableActivity,
  opts: { actorId?: string | null } = {},
): Promise<void> {
  const actorId =
    opts.actorId === undefined ? userId : opts.actorId;

  try {
    await db.insert(activities).values({
      userId,
      actorId,
      type: event.type,
      payload: event.payload,
    });

    // Fan out to followers only for user-driven events (system events
    // like region_update have actorId=null and don't belong in social
    // feeds). Errors here never block the primary action — fan-out is
    // strictly a notification convenience.
    if (actorId) {
      await fanoutFollowerNotifications(actorId, event).catch((err) => {
        logger.warn('[activity] fanout failed', err);
      });
    }
  } catch (err) {
    logger.error('Failed to record activity', err, { type: event.type });
  }
}

const FOLLOW_ACTIVITY_THROTTLE_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Insert a `follow_activity` notification for every follower of `actorId`
 * who hasn't already received a follow_activity from this actor in the
 * last FOLLOW_ACTIVITY_THROTTLE_MS window. Keeps the bell from spamming
 * when a user adds 30 items to a watchlist in a row.
 *
 * Implemented as a single INSERT ... SELECT so the work happens in the DB
 * — for a creator with thousands of followers this stays one round-trip.
 */
async function fanoutFollowerNotifications(
  actorId: string,
  event: RecordableActivity,
): Promise<void> {
  const cutoff = new Date(Date.now() - FOLLOW_ACTIVITY_THROTTLE_MS);

  // For each accepted follower of `actorId`:
  //   IF no recent (within cutoff) follow_activity notification exists
  //   from actorId → that follower, THEN insert one.
  //
  // The NOT EXISTS subquery handles the throttle inline so we don't fetch
  // the follower list into application memory.
  const payload = {
    activityType: event.type,
    activityPayload: event.payload,
  };

  // The LEFT JOIN to user_preferences with `IS DISTINCT FROM 'false'`
  // means a missing settings row OR a missing follow_activity key both
  // count as opted-in (matches the default in getNotificationPreferences).
  await db.execute(sql`
    INSERT INTO notifications (user_id, actor_id, type, payload)
    SELECT ${userFollows.followerId}, ${actorId}, 'follow_activity', ${payload}::jsonb
    FROM ${userFollows}
    LEFT JOIN ${userPreferences}
      ON ${userPreferences.userId} = ${userFollows.followerId}
    WHERE ${userFollows.followingId} = ${actorId}
      AND ${userFollows.status} = 'accepted'
      AND (${userPreferences.notificationSettings}->>'follow_activity') IS DISTINCT FROM 'false'
      AND NOT EXISTS (
        SELECT 1
        FROM ${notifications}
        WHERE ${notifications.userId} = ${userFollows.followerId}
          AND ${notifications.actorId} = ${actorId}
          AND ${notifications.type} = 'follow_activity'
          AND ${notifications.createdAt} > ${cutoff}
      )
  `);
}
