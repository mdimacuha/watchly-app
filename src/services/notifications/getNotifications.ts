import 'server-only';

import { db } from '@/db';
import { notifications, userBlocks, userFollows, userPreferences, userProfiles, users, watchlists } from '@/db/schema';
import { and, desc, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import { tmdbFetch } from '@/server/tmdb/client';
import { DEFAULT_VISIBILITY_PREFS, resolveProfileVisibility, type ProfileVisibility } from '@/services/profile/visibility';
import { getNotificationPreferences } from './preferences';

// ---------------------------------------------------------------------------
// Public shapes
// ---------------------------------------------------------------------------

/** "For you": things about you (follows, requests, title alerts). "Following": what people you follow are up to. */
export type NotificationScope = 'you' | 'following';

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
  /** Where the request stands now, so the row only offers Accept/Decline while it's open. */
  requestState: 'pending' | 'accepted' | 'gone';
}

interface FollowAcceptedNotification extends BaseNotification {
  kind: 'follow_accepted';
}

interface FollowBackNotification extends BaseNotification {
  kind: 'follow_back';
}

/** A title, collection or person named in a follow_activity row. */
export interface ActivityTitle {
  key: string;
  name: string | null;
  imageUrl: string | null;
  href: string | null;
  /** Person images are faces: shown round, not as posters. */
  isPerson: boolean;
  rating: number | null;
}

export type FollowActivityKind = 'favorite' | 'watchlist_add' | 'watchlist_create' | 'review';

export interface FollowActivityNotification extends BaseNotification {
  kind: 'follow_activity';
  activityKind: FollowActivityKind;
  /** Newest first; resolved for the first few only (the row previews them). */
  titles: ActivityTitle[];
  /** How many titles the group holds (can exceed `titles.length`). */
  total: number;
  /** The list, with its current name (renames show up). */
  watchlist: { id: string; name: string } | null;
}

/** A "Notify me when" alert firing on a title. System row: no actor. */
export interface TitleAlertNotification {
  id: string;
  isRead: boolean;
  createdAt: string;
  actor: null;
  href: string;
  kind: 'title_available' | 'title_leaving' | 'title_new_season';
  title: string | null;
  posterUrl: string | null;
  /** ISO country code the alert watches. */
  region: string;
  /** Services it arrived on (available) or left (leaving). */
  providers: string[];
  seasonNumber: number | null;
}

export type NotificationItem =
  | FollowRequestNotification
  | FollowAcceptedNotification
  | FollowBackNotification
  | FollowActivityNotification
  | TitleAlertNotification;

export interface NotificationsPayload {
  items: NotificationItem[];
  /** Cursor for the next page (pass as `before`); null at the end. */
  nextBefore: string | null;
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

const POSTER_BASE = 'https://image.tmdb.org/t/p/w185';
/** Titles resolved per group row (the poster strip). */
const PREVIEW = 4;

/** Written by services/alerts/check.ts. */
interface TitleAlertPayload {
  mediaType?: 'movie' | 'tv';
  mediaId?: string;
  region?: string;
  providers?: string[];
  seasonNumber?: number;
}

const TITLE_ALERT_KINDS = new Set(['title_available', 'title_leaving', 'title_new_season']);

/** Written by services/activity/record.ts. Rows from before grouping have no `items`. */
interface FollowActivityPayload {
  activityType: string;
  activityPayload: {
    mediaType?: string;
    mediaId?: string;
    watchlistId?: string;
    watchlistName?: string;
    rating?: number;
    count?: number;
  };
  items?: Array<{ mediaType: string; mediaId: string; rating?: number }>;
}

/** The group's titles, newest first, with the legacy single-title shape folded in. */
function activityItems(p: FollowActivityPayload): Array<{ mediaType: string; mediaId: string; rating?: number }> {
  if (Array.isArray(p.items)) return [...p.items].reverse();
  const a = p.activityPayload ?? {};
  return a.mediaType && a.mediaId ? [{ mediaType: a.mediaType, mediaId: a.mediaId, rating: a.rating }] : [];
}

function activityKindOf(type: string): FollowActivityKind | null {
  if (type === 'favorite' || type === 'watchlist_add' || type === 'watchlist_create' || type === 'review') return type;
  if (type === 'watchlist_bulk_add') return 'watchlist_add';
  return null;
}

type Media = { name: string; image: string | null };

/** Name + image for a title, collection or person (TMDB responses are cached for a day). */
async function lookupMedia(mediaType: string, mediaId: string): Promise<Media | null> {
  const path =
    mediaType === 'movie' || mediaType === 'tv'
      ? `/${mediaType}/${mediaId}`
      : mediaType === 'collection'
        ? `/collection/${mediaId}`
        : mediaType === 'artist'
          ? `/person/${mediaId}`
          : null;
  if (!path) return null;
  try {
    const raw = await tmdbFetch<{ title?: string; name?: string; poster_path?: string | null; profile_path?: string | null }>(path);
    return { name: raw.title ?? raw.name ?? '', image: raw.poster_path ?? raw.profile_path ?? null };
  } catch {
    return null; // unresolved: the row falls back to generic copy
  }
}

function hrefFor(mediaType: string, mediaId: string): string | null {
  if (mediaType === 'movie' || mediaType === 'tv') return `/title/${mediaType}/${mediaId}`;
  if (mediaType === 'collection') return `/collection/${mediaId}`;
  if (mediaType === 'artist') return `/artist/${mediaId}`;
  return null;
}

/**
 * One page of a user's notifications for a scope. Hydrates the actor and
 * resolves titles for previews. Following rows are re-checked against the
 * actor's current privacy (and whether you still follow them), so anything
 * made private, unfollowed or blocked since disappears.
 */
export async function getNotifications(
  userId: string,
  opts: { before?: string; pageSize?: number; scope?: NotificationScope } = {},
): Promise<NotificationsPayload> {
  const pageSize = Math.min(opts.pageSize ?? 30, 100);
  const scope = opts.scope ?? 'you';

  const filters = [
    eq(notifications.userId, userId),
    scope === 'following' ? eq(notifications.type, 'follow_activity') : ne(notifications.type, 'follow_activity'),
  ];
  if (opts.before) filters.push(sql`${notifications.createdAt} < ${opts.before}`);

  const rows = await db
    .select({
      id: notifications.id,
      type: notifications.type,
      payload: notifications.payload,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
      actorId: notifications.actorId,
      // Actor join — null when actorId is null (system events: title alerts).
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
    .where(and(...filters))
    .orderBy(desc(notifications.createdAt))
    .limit(pageSize + 1);

  const slice = rows.slice(0, pageSize);
  const nextBefore = rows.length > pageSize ? slice[slice.length - 1].createdAt.toISOString() : null;

  const ctx = await loadContext(userId, slice);

  // Resolve the previewed titles once each, in parallel.
  const wanted = new Map<string, { mediaType: string; mediaId: string }>();
  for (const r of slice) {
    if (TITLE_ALERT_KINDS.has(r.type)) {
      const p = r.payload as TitleAlertPayload;
      if (p.mediaType && p.mediaId) wanted.set(`${p.mediaType}:${p.mediaId}`, { mediaType: p.mediaType, mediaId: p.mediaId });
    } else if (r.type === 'follow_activity') {
      for (const it of activityItems(r.payload as FollowActivityPayload).slice(0, PREVIEW)) {
        wanted.set(`${it.mediaType}:${it.mediaId}`, it);
      }
    }
  }
  const media = new Map<string, Media | null>();
  await Promise.all(
    [...wanted].map(async ([key, it]) => media.set(key, await lookupMedia(it.mediaType, it.mediaId))),
  );

  const items = slice
    .map((r) => buildItem(r, media, ctx))
    .filter((i): i is NotificationItem => i !== null);

  return { items, nextBefore };
}

interface RawRow {
  id: string;
  type: (typeof notifications.$inferSelect)['type'];
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

interface Context {
  /** Actors blocked either way. */
  blocked: Set<string>;
  /** What each followed actor's followers may see right now (absent = you no longer follow them). */
  visibility: Map<string, ProfileVisibility>;
  /** Lists named in the page, current name + privacy. */
  lists: Map<string, { name: string; isPublic: boolean }>;
  /** Follow requests to you, by requester. */
  requests: Map<string, 'pending' | 'accepted'>;
}

async function loadContext(userId: string, rows: RawRow[]): Promise<Context> {
  const actorIds = [...new Set(rows.map((r) => r.actorId).filter((id): id is string => !!id))];
  const followActors = [...new Set(rows.filter((r) => r.type === 'follow_activity' && r.actorId).map((r) => r.actorId!))];
  const requesters = [...new Set(rows.filter((r) => r.type === 'follow_request' && r.actorId).map((r) => r.actorId!))];
  const listIds = [
    ...new Set(
      rows
        .filter((r) => r.type === 'follow_activity')
        .map((r) => (r.payload as FollowActivityPayload).activityPayload?.watchlistId)
        .filter((id): id is string => !!id),
    ),
  ];

  const [blocks, following, lists, requests] = await Promise.all([
    actorIds.length
      ? db
          .select({ blockerId: userBlocks.blockerId, blockedId: userBlocks.blockedId })
          .from(userBlocks)
          .where(
            or(
              and(eq(userBlocks.blockerId, userId), inArray(userBlocks.blockedId, actorIds)),
              and(eq(userBlocks.blockedId, userId), inArray(userBlocks.blockerId, actorIds)),
            ),
          )
      : [],
    followActors.length
      ? db
          .select({
            id: userFollows.followingId,
            profileVisibility: userPreferences.profileVisibility,
            watchlistsVisibility: userPreferences.watchlistsVisibility,
            hideFavorites: userPreferences.hideFavorites,
            hideWatched: userPreferences.hideWatched,
          })
          .from(userFollows)
          .leftJoin(userPreferences, eq(userPreferences.userId, userFollows.followingId))
          .where(
            and(
              eq(userFollows.followerId, userId),
              eq(userFollows.status, 'accepted'),
              inArray(userFollows.followingId, followActors),
            ),
          )
      : [],
    listIds.length
      ? db
          .select({ id: watchlists.id, name: watchlists.name, isPublic: watchlists.isPublic })
          .from(watchlists)
          .where(inArray(watchlists.id, listIds))
      : [],
    requesters.length
      ? db
          .select({ id: userFollows.followerId, status: userFollows.status })
          .from(userFollows)
          .where(and(eq(userFollows.followingId, userId), inArray(userFollows.followerId, requesters)))
      : [],
  ]);

  return {
    blocked: new Set(blocks.map((b) => (b.blockerId === userId ? b.blockedId : b.blockerId))),
    visibility: new Map(
      following.map((f) => [
        f.id,
        resolveProfileVisibility(
          {
            profileVisibility: f.profileVisibility ?? DEFAULT_VISIBILITY_PREFS.profileVisibility,
            watchlistsVisibility: f.watchlistsVisibility ?? DEFAULT_VISIBILITY_PREFS.watchlistsVisibility,
            hideFavorites: f.hideFavorites ?? DEFAULT_VISIBILITY_PREFS.hideFavorites,
            hideWatched: f.hideWatched ?? DEFAULT_VISIBILITY_PREFS.hideWatched,
          },
          'follower',
        ),
      ]),
    ),
    lists: new Map(lists.map((l) => [l.id, { name: l.name, isPublic: l.isPublic }])),
    requests: new Map(
      requests
        .filter((r) => r.status === 'pending' || r.status === 'accepted')
        .map((r) => [r.id, r.status as 'pending' | 'accepted']),
    ),
  };
}

function buildItem(r: RawRow, media: Map<string, Media | null>, ctx: Context): NotificationItem | null {
  if (r.type === 'title_available' || r.type === 'title_leaving' || r.type === 'title_new_season') {
    const p = r.payload as TitleAlertPayload;
    if (!p.mediaType || !p.mediaId) return null;
    const m = media.get(`${p.mediaType}:${p.mediaId}`);
    return {
      id: r.id,
      isRead: r.readAt !== null,
      createdAt: r.createdAt.toISOString(),
      actor: null,
      href: `/title/${p.mediaType}/${p.mediaId}`,
      kind: r.type,
      title: m?.name || null,
      posterUrl: m?.image ? `${POSTER_BASE}${m.image}` : null,
      region: p.region ?? '',
      providers: Array.isArray(p.providers) ? p.providers : [],
      seasonNumber: typeof p.seasonNumber === 'number' ? p.seasonNumber : null,
    };
  }
  if (!r.actorId || !r.actorUsername || ctx.blocked.has(r.actorId)) return null;

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
      return {
        ...base,
        kind: 'follow_request',
        href: `/user/${actor.username}`,
        requestState: ctx.requests.get(actor.id) ?? 'gone',
      };
    case 'follow_accepted':
      return { ...base, kind: 'follow_accepted', href: `/user/${actor.username}` };
    case 'follow_back':
      return { ...base, kind: 'follow_back', href: `/user/${actor.username}` };
    case 'follow_activity': {
      const payload = r.payload as FollowActivityPayload;
      const activityKind = activityKindOf(payload.activityType);
      if (!activityKind) return null;

      // Only what their profile still shows you.
      const vis = ctx.visibility.get(actor.id);
      if (!vis?.profile) return null;
      if (activityKind === 'favorite' && !vis.favorites) return null;
      const listId = payload.activityPayload?.watchlistId;
      const list = listId ? ctx.lists.get(listId) : undefined;
      if (activityKind === 'watchlist_add' || activityKind === 'watchlist_create') {
        if (!vis.watchlists || !list?.isPublic) return null;
      }

      const all = activityItems(payload);
      const titles: ActivityTitle[] = all.slice(0, PREVIEW).map((it) => {
        const m = media.get(`${it.mediaType}:${it.mediaId}`);
        return {
          key: `${it.mediaType}:${it.mediaId}`,
          name: m?.name || null,
          imageUrl: m?.image ? `${POSTER_BASE}${m.image}` : null,
          href: hrefFor(it.mediaType, it.mediaId),
          isPerson: it.mediaType === 'artist',
          rating: typeof it.rating === 'number' ? it.rating : null,
        };
      });
      // Pre-grouping bulk rows only carried a count.
      const total = all.length || (payload.activityPayload?.count ?? 0);

      // One title: open it. A list: open the list. Several favorites or
      // reviews: that tab of their profile.
      const href =
        list && listId
          ? `/watchlists/${listId}`
          : titles.length === 1 && total === 1 && titles[0].href
            ? titles[0].href
            : `/user/${actor.username}?tab=${activityKind === 'review' ? 'reviews' : 'favorites'}`;

      return {
        ...base,
        kind: 'follow_activity',
        activityKind,
        titles,
        total,
        watchlist: list && listId ? { id: listId, name: list.name } : null,
        href,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Counts / mark-read
// ---------------------------------------------------------------------------

/** Unread rows per scope (the tabs' counts). */
export async function getUnreadCounts(userId: string): Promise<Record<NotificationScope, number>> {
  const [row] = await db
    .select({
      you: sql<number>`count(*) filter (where ${notifications.type} <> 'follow_activity')::int`,
      following: sql<number>`count(*) filter (where ${notifications.type} = 'follow_activity')::int`,
    })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return { you: row?.you ?? 0, following: row?.following ?? 0 };
}

/**
 * The bell badge: things for you, plus activity from people you follow
 * only if you asked for that in Settings.
 */
export async function getUnreadNotificationCount(userId: string): Promise<number> {
  const [counts, prefs] = await Promise.all([getUnreadCounts(userId), getNotificationPreferences(userId)]);
  return counts.you + (prefs.following_badge ? counts.following : 0);
}

/** Marks a scope read (both when omitted). */
export async function markAllNotificationsRead(userId: string, scope?: NotificationScope): Promise<void> {
  const filters = [eq(notifications.userId, userId), isNull(notifications.readAt)];
  if (scope === 'following') filters.push(eq(notifications.type, 'follow_activity'));
  if (scope === 'you') filters.push(ne(notifications.type, 'follow_activity'));
  await db.update(notifications).set({ readAt: new Date() }).where(and(...filters));
}
