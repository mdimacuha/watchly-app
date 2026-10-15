import 'server-only';

import { db } from '@/db';
import { notifications, users, userProfiles } from '@/db/schema';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { tmdbFetch } from '@/server/tmdb/client';

// ---------------------------------------------------------------------------
// Public shapes
// ---------------------------------------------------------------------------

export interface NotificationActor {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string;
}

interface BaseNotification {
  id: string;
  isRead: boolean;
  createdAt: string;
  actor: NotificationActor;
  /** Where the row links to when clicked. */
  href: string;
}

interface FollowRequestNotification extends BaseNotification {
  kind: 'follow_request';
}

interface FollowAcceptedNotification extends BaseNotification {
  kind: 'follow_accepted';
}

interface FollowBackNotification extends BaseNotification {
  kind: 'follow_back';
}

interface FollowActivityNotification extends BaseNotification {
  kind: 'follow_activity';
  /** The kind of activity this notification mirrors. */
  activityKind: 'favorite' | 'watchlist_add' | 'watchlist_bulk_add' | 'watchlist_create';
  /** Resolved title (TMDB) — null when payload didn't carry mediaId. */
  title: string | null;
  posterUrl: string | null;
  watchlistName: string | null;
}

export type NotificationItem =
  | FollowRequestNotification
  | FollowAcceptedNotification
  | FollowBackNotification
  | FollowActivityNotification;

export interface NotificationsPayload {
  items: NotificationItem[];
  hasMore: boolean;
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

const POSTER_BASE = 'https://image.tmdb.org/t/p/w185';

/** Payload shapes mirrored from `services/activity/record.ts`. */
interface FollowActivityPayload {
  activityType:
    | 'favorite'
    | 'watchlist_add'
    | 'watchlist_bulk_add'
    | 'watchlist_create';
  activityPayload: Record<string, unknown>;
}

/**
 * Paginated notifications for a user. Hydrates actor avatar + display
 * name, and (for follow_activity) resolves TMDB title + poster URL when
 * the payload references a single media item.
 */
export async function getNotifications(
  userId: string,
  opts: { before?: string; pageSize?: number } = {},
): Promise<NotificationsPayload> {
  const pageSize = Math.min(opts.pageSize ?? 30, 100);

  // 1. Raw rows + LEFT-JOIN to users + userProfiles for the actor.
  const baseFilters = [eq(notifications.userId, userId)];
  if (opts.before) {
    baseFilters.push(sql`${notifications.createdAt} < ${opts.before}`);
  }

  const rows = await db
    .select({
      id: notifications.id,
      type: notifications.type,
      payload: notifications.payload,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
      actorId: notifications.actorId,
      // Actor join — null when actorId is null (system events, none in v1).
      actorUsername: users.username,
      actorFirstName: users.firstName,
      actorLastName: users.lastName,
      actorUsersAvatar: users.avatarUrl,
      actorProfileAvatar: userProfiles.avatarUrl,
      actorDisplayName: userProfiles.displayName,
    })
    .from(notifications)
    .leftJoin(users, eq(users.id, notifications.actorId))
    .leftJoin(userProfiles, eq(userProfiles.userId, notifications.actorId))
    .where(and(...baseFilters))
    .orderBy(desc(notifications.createdAt))
    .limit(pageSize + 1);

  const hasMore = rows.length > pageSize;
  const slice = rows.slice(0, pageSize);

  // 2. Collect mediaIds from follow_activity rows so we can batch TMDB
  // fetches instead of one-per-row.
  type MediaKey = string; // "movie:123" / "tv:456"
  const mediaKeys = new Set<MediaKey>();
  for (const r of slice) {
    if (r.type !== 'follow_activity') continue;
    const inner = (r.payload as FollowActivityPayload).activityPayload as
      | { mediaType?: string; mediaId?: string }
      | undefined;
    if (inner?.mediaType && inner?.mediaId) {
      mediaKeys.add(`${inner.mediaType}:${inner.mediaId}`);
    }
  }

  const mediaCache = new Map<
    MediaKey,
    { title: string; posterPath: string | null }
  >();
  await Promise.all(
    Array.from(mediaKeys).map(async (key) => {
      const [mediaType, mediaId] = key.split(':');
      if (mediaType !== 'movie' && mediaType !== 'tv') return;
      try {
        const raw = await tmdbFetch<{
          title?: string;
          name?: string;
          poster_path?: string | null;
        }>(`/${mediaType}/${mediaId}`);
        mediaCache.set(key, {
          title: raw.title ?? raw.name ?? '',
          posterPath: raw.poster_path ?? null,
        });
      } catch {
        // leave unresolved — row falls back to generic copy
      }
    }),
  );

  // 3. Map to NotificationItem.
  const items: NotificationItem[] = slice
    .map((r) => buildItem(r, mediaCache))
    .filter((i): i is NotificationItem => i !== null);

  return { items, hasMore };
}

interface RawRow {
  id: string;
  type: 'follow_request' | 'follow_accepted' | 'follow_back' | 'follow_activity';
  payload: unknown;
  readAt: Date | null;
  createdAt: Date;
  actorId: string | null;
  actorUsername: string | null;
  actorFirstName: string | null;
  actorLastName: string | null;
  actorUsersAvatar: string | null;
  actorProfileAvatar: string | null;
  actorDisplayName: string | null;
}

function buildItem(
  r: RawRow,
  mediaCache: Map<string, { title: string; posterPath: string | null }>,
): NotificationItem | null {
  if (!r.actorId || !r.actorUsername) return null;

  const actor: NotificationActor = {
    id: r.actorId,
    username: r.actorUsername,
    displayName:
      r.actorDisplayName ||
      `${r.actorFirstName ?? ''} ${r.actorLastName ?? ''}`.trim() ||
      r.actorUsername,
    avatarUrl: r.actorProfileAvatar || r.actorUsersAvatar || '',
  };

  const base = {
    id: r.id,
    isRead: r.readAt !== null,
    createdAt: r.createdAt.toISOString(),
    actor,
  };

  switch (r.type) {
    case 'follow_request':
      // Land in the inbox so the user can immediately Accept/Decline;
      // the actor's profile is one click from there via the row.
      return {
        ...base,
        kind: 'follow_request',
        href: `/me/follow-requests`,
      };
    case 'follow_accepted':
      return {
        ...base,
        kind: 'follow_accepted',
        href: `/user/${actor.username}`,
      };
    case 'follow_back':
      return {
        ...base,
        kind: 'follow_back',
        href: `/user/${actor.username}`,
      };
    case 'follow_activity': {
      const payload = r.payload as FollowActivityPayload;
      const inner = payload.activityPayload as {
        mediaType?: 'movie' | 'tv' | 'collection' | 'artist';
        mediaId?: string;
        watchlistId?: string;
        watchlistName?: string;
      };

      let title: string | null = null;
      let posterUrl: string | null = null;
      let href = `/user/${actor.username}`;
      if (inner.mediaType && inner.mediaId) {
        const key = `${inner.mediaType}:${inner.mediaId}`;
        const cached = mediaCache.get(key);
        if (cached) {
          title = cached.title || null;
          posterUrl = cached.posterPath
            ? `${POSTER_BASE}${cached.posterPath}`
            : null;
        }
        if (inner.mediaType === 'movie' || inner.mediaType === 'tv') {
          href = `/title/${inner.mediaType}/${inner.mediaId}`;
        }
      } else if (inner.watchlistId) {
        href = `/watchlists/${inner.watchlistId}`;
      }

      return {
        ...base,
        kind: 'follow_activity',
        activityKind: payload.activityType,
        title,
        posterUrl,
        watchlistName: inner.watchlistName ?? null,
        href,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Counts / mark-read
// ---------------------------------------------------------------------------

export async function getUnreadNotificationCount(
  userId: string,
): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(
      and(eq(notifications.userId, userId), isNull(notifications.readAt)),
    );
  return rows[0]?.count ?? 0;
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(eq(notifications.userId, userId), isNull(notifications.readAt)),
    );
}
