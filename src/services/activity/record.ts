import { db } from '@/db';
import { activities, userPreferences, watchlists } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';
import { logger } from '@/lib/log';
import { DEFAULT_VISIBILITY_PREFS, resolveProfileVisibility } from '@/services/profile/visibility';

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
  /** The titles added, so followers see them rather than "multiple titles". */
  items?: Array<{ mediaType: 'movie' | 'tv'; mediaId: string }>;
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
    if (actorId && event.type !== 'region_update') {
      await fanoutFollowerNotifications(actorId, event).catch((err) => {
        logger.warn('[activity] fanout failed', err);
      });
    }
  } catch (err) {
    logger.error('Failed to record activity', err, { type: event.type });
  }
}

/** One title inside a grouped follow_activity notification. */
export interface FollowActivityItem {
  mediaType: string;
  mediaId: string;
  rating?: number;
}

// A follower's notification keeps growing while the actor keeps going (each
// new title bumps it to the top), until it's read or goes quiet this long.
const GROUP_WINDOW_MS = 3 * 60 * 60 * 1000;

type FanoutEvent = Exclude<RecordableActivity, { type: 'region_update' }>;

/** How an event groups: same actor + same key = one notification. */
function groupOf(event: FanoutEvent): { activityType: string; groupKey: string; items: FollowActivityItem[] } {
  switch (event.type) {
    case 'favorite':
      return { activityType: 'favorite', groupKey: 'favorite', items: [{ mediaType: event.payload.mediaType, mediaId: event.payload.mediaId }] };
    case 'review':
      return {
        activityType: 'review',
        groupKey: 'review',
        items: [{ mediaType: event.payload.mediaType, mediaId: event.payload.mediaId, rating: event.payload.rating }],
      };
    // Single and bulk adds to one list are the same story for a follower.
    case 'watchlist_add':
      return {
        activityType: 'watchlist_add',
        groupKey: `watchlist:${event.payload.watchlistId}`,
        items: [{ mediaType: event.payload.mediaType, mediaId: event.payload.mediaId }],
      };
    case 'watchlist_bulk_add':
      return { activityType: 'watchlist_add', groupKey: `watchlist:${event.payload.watchlistId}`, items: event.payload.items ?? [] };
    case 'watchlist_create':
      return { activityType: 'watchlist_create', groupKey: `watchlist_create:${event.payload.watchlistId}`, items: [] };
  }
}

/**
 * Whether the actor's followers may see this on the actor's profile right
 * now: the same rules as the profile (private profiles, hidden favorites,
 * watchlist visibility, private lists). Nothing private is ever announced.
 */
async function followersCanSee(actorId: string, event: FanoutEvent): Promise<boolean> {
  const [row] = await db
    .select({
      profileVisibility: userPreferences.profileVisibility,
      watchlistsVisibility: userPreferences.watchlistsVisibility,
      hideFavorites: userPreferences.hideFavorites,
      hideWatched: userPreferences.hideWatched,
      hideLikes: userPreferences.hideLikes,
    })
    .from(userPreferences)
    .where(eq(userPreferences.userId, actorId))
    .limit(1);
  const vis = resolveProfileVisibility(row ?? DEFAULT_VISIBILITY_PREFS, 'follower');
  if (!vis.profile) return false;
  if (event.type === 'favorite') return vis.favorites;
  if (event.type === 'review') return true;
  if (!vis.watchlists) return false;
  const [list] = await db
    .select({ isPublic: watchlists.isPublic })
    .from(watchlists)
    .where(eq(watchlists.id, event.payload.watchlistId))
    .limit(1);
  return list?.isPublic === true;
}

/**
 * Tell every accepted follower of `actorId` (who hasn't muted follow
 * activity) about this event. Instead of one row per title, the event
 * joins that follower's unread notification for the same story (favorites,
 * reviews, or adds to one list) from the last few hours, so a 30-title
 * session is one row listing all 30, not 30 rows or a random sample.
 *
 * One statement: the UPDATE grows existing groups, the INSERT starts one
 * for every recipient that had none. Runs in the DB, so a creator with
 * thousands of followers is still one round-trip.
 */
async function fanoutFollowerNotifications(
  actorId: string,
  event: FanoutEvent,
): Promise<void> {
  if (!(await followersCanSee(actorId, event))) return;

  const { activityType, groupKey, items } = groupOf(event);
  if (activityType === 'watchlist_add' && items.length === 0) return;
  const cutoff = new Date(Date.now() - GROUP_WINDOW_MS);
  const activityPayload =
    event.type === 'watchlist_bulk_add'
      ? { watchlistId: event.payload.watchlistId, watchlistName: event.payload.watchlistName }
      : event.payload;
  const payload = { activityType, activityPayload, groupKey, items };

  // A missing settings row OR a missing follow_activity key both count as
  // opted-in (matches the default in getNotificationPreferences). Items
  // already in a group (unfavorite, favorite again) aren't added twice.
  await db.execute(sql`
    WITH recipients AS (
      SELECT f.follower_id AS user_id
      FROM user_follows f
      LEFT JOIN user_preferences p ON p.user_id = f.follower_id
      WHERE f.following_id = ${actorId}
        AND f.status = 'accepted'
        AND (p.notification_settings->>'follow_activity') IS DISTINCT FROM 'false'
    ),
    grouped AS (
      UPDATE notifications n
      SET payload = jsonb_set(
            n.payload,
            '{items}',
            coalesce(n.payload->'items', '[]'::jsonb) || coalesce((
              SELECT jsonb_agg(x)
              FROM jsonb_array_elements(${JSON.stringify(items)}::jsonb) x
              WHERE NOT coalesce(n.payload->'items', '[]'::jsonb) @> jsonb_build_array(x - 'rating')
            ), '[]'::jsonb)
          ),
          created_at = now()
      WHERE n.user_id IN (SELECT user_id FROM recipients)
        AND n.actor_id = ${actorId}
        AND n.type = 'follow_activity'
        AND n.read_at IS NULL
        AND n.created_at > ${cutoff}
        AND n.payload->>'groupKey' = ${groupKey}
      RETURNING n.user_id
    )
    INSERT INTO notifications (user_id, actor_id, type, payload)
    SELECT r.user_id, ${actorId}, 'follow_activity', ${JSON.stringify(payload)}::jsonb
    FROM recipients r
    WHERE r.user_id NOT IN (SELECT user_id FROM grouped)
  `);
}
