import { db } from '@/db';
import { activities } from '@/db/schema';
import { and, count, desc, eq, isNull, gte, lt } from 'drizzle-orm';
import { getUserRowById, getUserProfileRow } from '@/services/users/rows';
import { tmdbFetch } from '@/server/tmdb/client';
import { mapMovie, mapTv, mapPerson, mapCollection } from '@/server/tmdb/mappers';
import type { ActivityItem, ActivityResponse, ActivityGroupLabel } from './types';

const DEFAULT_PAGE_SIZE = 50;
const WEEK_DAYS = 7;
const MAX_DAYS = 90; // hard cap on history reachable from the UI
const AGGREGATE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

interface ActorView {
  name: string;
  avatarUrl: string;
}

interface ActivityQueryOpts {
  /** ISO timestamp of the oldest row already shown. Returns items strictly older. */
  before?: string;
  /** Max rows to return per page. */
  pageSize?: number;
}

export type ActivityFeedResponse = ActivityResponse & { hasMore: boolean };

/**
 * Fetch the current user's activity feed. Default page = last 50 events from
 * the past 7 days. Pass `before` to load older history (cursor by createdAt).
 * Hard cap = 90 days; nothing older is reachable from the UI.
 */
export async function getActivity(
  userId: string,
  opts: ActivityQueryOpts = {},
): Promise<ActivityFeedResponse> {
  const viewer = await loadViewer(userId);
  const pageSize = opts.pageSize ?? DEFAULT_PAGE_SIZE;

  // First page = last 7 days. Pagination expands back to 90 days max.
  const isInitial = !opts.before;
  const lowerBound = startOfDay(daysAgo(isInitial ? WEEK_DAYS : MAX_DAYS));

  const baseWhere = and(
    eq(activities.userId, userId),
    gte(activities.createdAt, lowerBound),
  );
  const where = isInitial
    ? baseWhere
    : and(baseWhere, lt(activities.createdAt, new Date(opts.before!)));

  // Fetch one extra row to know if there's more beyond this page.
  const rows = await db
    .select()
    .from(activities)
    .where(where)
    .orderBy(desc(activities.createdAt))
    .limit(pageSize + 1);

  const hasMore = rows.length > pageSize;
  const trimmed = hasMore ? rows.slice(0, pageSize) : rows;

  const clustered = clusterWatchlistAdds(trimmed);
  const items = await Promise.all(
    clustered.map((c) =>
      c.kind === 'single' ? mapRow(c.row, viewer) : mapAggregatedGroup(c.rows, viewer),
    ),
  );
  return {
    items: items.filter((i): i is ActivityItem => i !== null),
    hasMore,
  };
}

/** Unread count for the sidebar badge. */
export async function getUnreadActivityCount(userId: string): Promise<number> {
  const cutoff = startOfDay(daysAgo(MAX_DAYS));
  const rows = await db
    .select({ count: count() })
    .from(activities)
    .where(
      and(
        eq(activities.userId, userId),
        isNull(activities.readAt),
        gte(activities.createdAt, cutoff),
      ),
    );
  return Number(rows[0]?.count ?? 0);
}

type ActivityRowT = typeof activities.$inferSelect;
type ClusterEntry =
  | { kind: 'single'; row: ActivityRowT }
  | { kind: 'group'; rows: ActivityRowT[] };

function clusterWatchlistAdds(rows: ActivityRowT[]): ClusterEntry[] {
  const out: ClusterEntry[] = [];
  let i = 0;
  while (i < rows.length) {
    const row = rows[i];
    if (row.type !== 'watchlist_add') {
      out.push({ kind: 'single', row });
      i++;
      continue;
    }

    const watchlistId = (row.payload as Record<string, unknown>).watchlistId;
    const group: ActivityRowT[] = [row];
    let j = i + 1;
    while (j < rows.length) {
      const next = rows[j];
      if (next.type !== 'watchlist_add') break;
      const nextWatchlistId = (next.payload as Record<string, unknown>).watchlistId;
      if (nextWatchlistId !== watchlistId) break;
      // group[0] is newest, next is older → diff measures the group's span.
      if (group[0].createdAt.getTime() - next.createdAt.getTime() > AGGREGATE_WINDOW_MS) {
        break;
      }
      group.push(next);
      j++;
    }

    if (group.length >= 2) out.push({ kind: 'group', rows: group });
    else out.push({ kind: 'single', row });
    i = j;
  }
  return out;
}

async function mapAggregatedGroup(
  groupRows: ActivityRowT[],
  viewer: ActorView,
): Promise<ActivityItem | null> {
  // groupRows are DESC; use the newest as the display timestamp.
  const newest = groupRows[0];
  const payload = newest.payload as Record<string, unknown>;
  const watchlistName = String(payload.watchlistName ?? 'a watchlist');

  const enriched = await Promise.all(
    groupRows.map((r) => {
      const p = r.payload as Record<string, unknown>;
      return enrichMedia(
        p.mediaType as 'movie' | 'tv',
        String(p.mediaId),
      );
    }),
  );

  const titles = enriched
    .map((e) => e?.title)
    .filter((t): t is string => Boolean(t));
  // Index of the first row that produced a poster — we want the poster's
  // navigation target to point to *that* row's title page, not blindly the
  // newest, since the newest may not have an artwork.
  const firstPosterIdx = enriched.findIndex((e) => e?.posterUrl);
  const firstPoster: string | undefined =
    firstPosterIdx >= 0
      ? enriched[firstPosterIdx]?.posterUrl ?? undefined
      : undefined;
  const firstPosterRow =
    firstPosterIdx >= 0 ? groupRows[firstPosterIdx] : undefined;
  const firstPosterPayload =
    (firstPosterRow?.payload as Record<string, unknown> | undefined) ?? null;
  const firstPosterHref = firstPosterPayload
    ? `/title/${String(firstPosterPayload.mediaType)}/${String(firstPosterPayload.mediaId)}`
    : undefined;

  if (titles.length === 0) return null;

  const watchlistId = payload.watchlistId
    ? String(payload.watchlistId)
    : undefined;
  const aggregatedHref = watchlistId ? `/watchlists/${watchlistId}` : undefined;

  // If TMDB resolved only one title, fall through to the existing
  // single-add kind so the UI behaves consistently. Link to the title page.
  if (titles.length === 1) {
    const firstRow = groupRows[0].payload as Record<string, unknown>;
    const oneMediaType = firstRow.mediaType as 'movie' | 'tv';
    const oneMediaId = String(firstRow.mediaId);
    return {
      id: newest.id,
      createdAt: newest.createdAt.toISOString(),
      group: groupFor(newest.createdAt),
      isRead: groupRows.every((r) => r.readAt !== null),
      href: `/title/${oneMediaType}/${oneMediaId}`,
      kind: 'watchlist_add',
      actor: viewer,
      title: titles[0],
      targetWatchlistName: watchlistName,
      posterUrl: firstPoster,
    };
  }

  return {
    id: newest.id,
    createdAt: newest.createdAt.toISOString(),
    group: groupFor(newest.createdAt),
    isRead: groupRows.every((r) => r.readAt !== null),
    href: aggregatedHref,
    kind: 'watchlist_add_aggregated',
    actor: viewer,
    titles,
    count: titles.length,
    targetWatchlistName: watchlistName,
    posterUrl: firstPoster,
    posterHref: firstPosterHref,
  };
}

/** Set read_at = now() on the user's unread activities. */
export async function markAllActivityRead(userId: string): Promise<void> {
  await db
    .update(activities)
    .set({ readAt: new Date() })
    .where(and(eq(activities.userId, userId), isNull(activities.readAt)));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function loadViewer(userId: string): Promise<ActorView> {
  // Cached accessors — on the /me page these rows were already loaded by
  // getProfileWithStats this request, so this resolves without new queries.
  const [userRow, profileRow] = await Promise.all([
    getUserRowById(userId),
    getUserProfileRow(userId),
  ]);
  return {
    name: 'You',
    avatarUrl: profileRow?.avatarUrl || userRow?.avatarUrl || '',
  };
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function daysAgo(n: number): Date {
  const x = new Date();
  x.setDate(x.getDate() - n);
  return x;
}

function hrefForFavorite(
  mediaType: 'movie' | 'tv' | 'collection' | 'artist',
  mediaId: string,
): string {
  switch (mediaType) {
    case 'movie':
    case 'tv':
      return `/title/${mediaType}/${mediaId}`;
    case 'collection':
      return `/collection/${mediaId}`;
    case 'artist':
      return `/artist/${mediaId}`;
  }
}

function groupFor(createdAt: Date): ActivityGroupLabel {
  const todayStart = startOfDay(new Date());
  const yesterdayStart = startOfDay(daysAgo(1));
  const weekStart = startOfDay(daysAgo(WEEK_DAYS));
  if (createdAt >= todayStart) return 'TODAY';
  if (createdAt >= yesterdayStart) return 'YESTERDAY';
  if (createdAt >= weekStart) return 'THIS WEEK';
  return 'OLDER';
}

async function mapRow(row: ActivityRowT, viewer: ActorView): Promise<ActivityItem | null> {
  const base = {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    group: groupFor(row.createdAt),
    isRead: row.readAt !== null,
  };

  const payload = row.payload as Record<string, unknown>;

  switch (row.type) {
    case 'favorite': {
      const mediaType = payload.mediaType as 'movie' | 'tv' | 'collection' | 'artist';
      const mediaId = String(payload.mediaId);
      const enriched = await enrichMedia(mediaType, mediaId);
      if (!enriched) return null;
      return {
        ...base,
        href: hrefForFavorite(mediaType, mediaId),
        kind: 'favorite',
        actor: viewer,
        title: enriched.title,
        posterUrl: enriched.posterUrl ?? undefined,
      };
    }
    case 'watchlist_add': {
      const mediaType = payload.mediaType as 'movie' | 'tv';
      const mediaId = String(payload.mediaId);
      const enriched = await enrichMedia(mediaType, mediaId);
      if (!enriched) return null;
      return {
        ...base,
        href: `/title/${mediaType}/${mediaId}`,
        kind: 'watchlist_add',
        actor: viewer,
        title: enriched.title,
        targetWatchlistName: String(payload.watchlistName ?? 'a watchlist'),
        posterUrl: enriched.posterUrl ?? undefined,
      };
    }
    case 'watchlist_bulk_add': {
      const watchlistId = payload.watchlistId
        ? String(payload.watchlistId)
        : undefined;
      return {
        ...base,
        href: watchlistId ? `/watchlists/${watchlistId}` : undefined,
        kind: 'watchlist_bulk_add',
        actor: viewer,
        count: Number(payload.count ?? 0),
        targetWatchlistName: String(payload.watchlistName ?? 'a watchlist'),
      };
    }
    case 'watchlist_create': {
      const watchlistId = payload.watchlistId
        ? String(payload.watchlistId)
        : undefined;
      return {
        ...base,
        href: watchlistId ? `/watchlists/${watchlistId}` : undefined,
        kind: 'watchlist_create',
        actor: viewer,
        watchlistName: String(payload.watchlistName ?? 'a watchlist'),
      };
    }
    case 'region_update': {
      return {
        ...base,
        href: '/settings/region',
        kind: 'region_update',
        regionName: String(payload.regionName ?? 'Unknown'),
      };
    }
    case 'review': {
      const mediaType = payload.mediaType as 'movie' | 'tv';
      const mediaId = String(payload.mediaId);
      const enriched = await enrichMedia(mediaType, mediaId);
      if (!enriched) return null;
      return {
        ...base,
        href: `/title/${mediaType}/${mediaId}`,
        kind: 'review',
        actor: viewer,
        title: enriched.title,
        rating: Number(payload.rating ?? 0),
        posterUrl: enriched.posterUrl ?? undefined,
      };
    }
    case 'follow':
      // Defer until social ships; drop silently if any sneak in.
      return null;
  }
}

const TMDB_POSTER_BASE = 'https://image.tmdb.org/t/p/w92';

type Enriched = { title: string; posterUrl: string | null };

async function enrichMedia(
  mediaType: 'movie' | 'tv' | 'collection' | 'artist',
  mediaId: string,
): Promise<Enriched | null> {
  try {
    const raw = await tmdbFetch<Record<string, unknown>>(
      `/${mediaTypeToPath(mediaType)}/${mediaId}`,
    );
    switch (mediaType) {
      case 'movie': {
        const m = mapMovie({ ...raw, media_type: 'movie' });
        return {
          title: m.title,
          posterUrl: m.posterPath ? `${TMDB_POSTER_BASE}${m.posterPath}` : null,
        };
      }
      case 'tv': {
        const t = mapTv({ ...raw, media_type: 'tv' });
        return {
          title: t.name,
          posterUrl: t.posterPath ? `${TMDB_POSTER_BASE}${t.posterPath}` : null,
        };
      }
      case 'collection': {
        const c = mapCollection(raw);
        return {
          title: c.name,
          posterUrl: c.posterPath ? `${TMDB_POSTER_BASE}${c.posterPath}` : null,
        };
      }
      case 'artist': {
        const p = mapPerson({ ...raw, media_type: 'person' });
        return { title: p.name, posterUrl: null };
      }
    }
  } catch {
    return null;
  }
}

function mediaTypeToPath(t: 'movie' | 'tv' | 'collection' | 'artist'): string {
  switch (t) {
    case 'movie':
      return 'movie';
    case 'tv':
      return 'tv';
    case 'collection':
      return 'collection';
    case 'artist':
      return 'person';
  }
}
