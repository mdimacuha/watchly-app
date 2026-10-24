import { db } from '@/db';
import { watchlists, watchlistItems, users, userProfiles } from '@/db/schema';
import { and, desc, eq, inArray, isNull, lte, sql } from 'drizzle-orm';
import { tmdbFetch } from '@/server/tmdb/client';
import { mapWithConcurrency } from '@/lib/concurrency';
import { recordActivity } from '@/services/activity/record';
import {
  createWatchlistSchema,
  updateWatchlistSchema,
  updateItemStatusSchema,
  updateItemNotesSchema,
  reorderItemsSchema,
  setItemRankSchema,
  WATCHED_STATUSES,
  isWatchedStatus,
  type CreateWatchlistInput,
  type UpdateWatchlistInput,
  type WatchlistMediaType,
  type WatchlistItemStatus,
} from './validators';
import {
  ValidationAppError,
  NotFoundAppError,
  ForbiddenAppError,
} from '@/utils/errors';
import { requireVerifiedOrInGrace } from '@/services/auth/verificationGate';
import { moderateText } from '@/services/moderation/contentModeration';
import { logger } from '@/lib/log';
import { placeAtRank } from '@/lib/ranking';
import { invalidateForYouPool, libraryTag } from '@/services/forYou/cacheTag';
import { invalidateNewFeed } from '@/services/newReleases/cacheTag';
import { journeyPatch } from './journey';
import { unstable_cache } from 'next/cache';

// Helper: runs name + description through moderateText. Throws a
// generic ValidationAppError on profanity / slur match so the user
// never sees the offending term echoed back.
function moderateWatchlistFields(
  fields: { name?: string; description?: string },
  userId: string,
): void {
  if (fields.name !== undefined) {
    const m = moderateText(fields.name, { minLength: 1, maxLength: 80 });
    if (!m.allowed) {
      logger.warn('[watchlist] name rejected', { userId, reason: m.reason });
      throw new ValidationAppError(
        m.reason === 'profanity' || m.reason === 'racial_offensive'
          ? 'This watchlist name is not allowed.'
          : m.message ?? 'Invalid watchlist name.',
      );
    }
  }
  if (fields.description !== undefined && fields.description.length > 0) {
    const m = moderateText(fields.description, {
      maxLength: 280,
      allowEmpty: true,
    });
    if (!m.allowed) {
      logger.warn('[watchlist] description rejected', {
        userId,
        reason: m.reason,
      });
      throw new ValidationAppError(
        m.reason === 'profanity' || m.reason === 'racial_offensive'
          ? 'This description is not allowed.'
          : m.message ?? 'Invalid description.',
      );
    }
  }
}

export type { WatchlistMediaType, WatchlistItemStatus } from './validators';

export const DEFAULT_WATCHLIST_NAME = 'My Watchlist';

export type Watchlist = typeof watchlists.$inferSelect;
export type WatchlistItem = typeof watchlistItems.$inferSelect;
export type WatchlistWithCount = Watchlist & {
  itemCount: number;
  /** Up to 3 TMDB poster paths from the top items, for the collage thumbnail. */
  posterPaths: string[];
  /** Items watched (finished or rewatch). Only set by `listWatchlists` (the owner's page). */
  finishedCount?: number;
  /** Items in progress (watching; rewatch counts as watched). Only set by `listWatchlists`. */
  watchingCount?: number;
  /** Later of the list's own edit and its newest item change. Only set by `listWatchlists`. */
  lastActivityAt?: Date;
  /** Poster + title of the top items (`listWatchlists` previews option, else 3). */
  previews?: { posterPath: string; title: string }[];
  /** Sum of every item's runtime, minutes (`listWatchlists` runtimes option). */
  runtimeMinutes?: number;
  /** Runtime of watched (finished / rewatch) items, minutes. */
  watchedRuntimeMinutes?: number;
};
export interface WatchlistOwner {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  displayName: string;
  avatarUrl: string;
  /** Accent slug — pages on this watchlist render with this owner's accent. */
  accentColor: string | null;
}

const THUMBNAIL_POSTER_COUNT = 3;

// ---------------------------------------------------------------------------
// CRUD on watchlists
// ---------------------------------------------------------------------------

export async function createWatchlist(
  userId: string,
  input: CreateWatchlistInput,
): Promise<Watchlist> {
  await requireVerifiedOrInGrace(userId);
  const parsed = createWatchlistSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationAppError('Invalid watchlist input', parsed.error.flatten());
  }

  moderateWatchlistFields(
    { name: parsed.data.name, description: parsed.data.description },
    userId,
  );

  const [row] = await db
    .insert(watchlists)
    .values({
      userId,
      name: parsed.data.name,
      description: parsed.data.description ?? '',
      isPublic: parsed.data.isPublic ?? false,
    })
    .returning();

  await recordActivity(userId, {
    type: 'watchlist_create',
    payload: { watchlistId: row.id, watchlistName: row.name },
  });

  return row;
}

export async function updateWatchlist(
  watchlistId: string,
  userId: string,
  input: UpdateWatchlistInput,
): Promise<Watchlist> {
  const parsed = updateWatchlistSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationAppError('Invalid watchlist input', parsed.error.flatten());
  }

  moderateWatchlistFields(
    { name: parsed.data.name, description: parsed.data.description },
    userId,
  );

  // Ownership check before update to give a clean error.
  await requireOwnedWatchlist(watchlistId, userId);

  const [row] = await db
    .update(watchlists)
    .set({
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.description !== undefined
        ? { description: parsed.data.description }
        : {}),
      ...(parsed.data.isPublic !== undefined
        ? { isPublic: parsed.data.isPublic }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(watchlists.id, watchlistId))
    .returning();

  return row;
}

export async function deleteWatchlist(
  watchlistId: string,
  userId: string,
): Promise<void> {
  await requireOwnedWatchlist(watchlistId, userId);

  await db.delete(watchlists).where(eq(watchlists.id, watchlistId));
  invalidateForYouPool(userId);
  invalidateNewFeed(userId);
}

type WatchlistAggregate = Omit<WatchlistWithCount, 'posterPaths'>;

/**
 * `previews`: how many top items carry poster + title (the watchlists page
 * scrubs through them). `runtimes`: attach total / watched runtime per list.
 */
export async function listWatchlists(
  userId: string,
  opts: { previews?: number; runtimes?: boolean; publicOnly?: boolean } = {},
): Promise<WatchlistWithCount[]> {
  const rows = await db
    .select({
      id: watchlists.id,
      userId: watchlists.userId,
      name: watchlists.name,
      description: watchlists.description,
      isPublic: watchlists.isPublic,
      createdAt: watchlists.createdAt,
      updatedAt: watchlists.updatedAt,
      itemCount: sql<number>`count(${watchlistItems.id})::int`,
      // Progress for the owner's list page, in the same grouped query.
      finishedCount: sql<number>`count(${watchlistItems.id}) filter (where ${inArray(watchlistItems.status, [...WATCHED_STATUSES])})::int`,
      watchingCount: sql<number>`count(${watchlistItems.id}) filter (where ${watchlistItems.status} = 'watching')::int`,
      // Item adds / status changes don't touch the list row, so "last
      // updated" is the later of the list's own edit and its newest item.
      lastActivityAt: sql<Date>`greatest(${watchlists.updatedAt}, max(${watchlistItems.updatedAt}))`.mapWith(
        (v: string | Date) => new Date(v),
      ),
    })
    .from(watchlists)
    .leftJoin(watchlistItems, eq(watchlistItems.watchlistId, watchlists.id))
    .where(opts.publicOnly ? and(eq(watchlists.userId, userId), eq(watchlists.isPublic, true)) : eq(watchlists.userId, userId))
    .groupBy(watchlists.id)
    .orderBy(sql`greatest(${watchlists.updatedAt}, max(${watchlistItems.updatedAt})) desc`);

  const [withPosters, runtimes] = await Promise.all([
    attachPosters(rows, opts.previews),
    opts.runtimes ? getWatchlistRuntimes(userId) : Promise.resolve(null),
  ]);
  if (!runtimes) return withPosters;
  return withPosters.map((l) => ({
    ...l,
    runtimeMinutes: runtimes[l.id]?.totalMinutes ?? 0,
    watchedRuntimeMinutes: runtimes[l.id]?.watchedMinutes ?? 0,
  }));
}

/**
 * Public-only watchlists for a user, shaped like the owner's list page
 * (scrub previews, progress, runtimes) so the profile can use the same cover
 * cards. Used by `/user/[username]` and `/me`.
 */
export async function listPublicWatchlists(
  userId: string,
): Promise<WatchlistWithCount[]> {
  // Public lists only, so no posters are fetched for lists nobody here sees.
  return listWatchlists(userId, { previews: 12, runtimes: true, publicOnly: true });
}

export type TitlePreview = { posterPath: string; title: string };

/** Poster + title for one `mediaType:mediaId` key; null when TMDB has no poster or fails. */
async function fetchPreview(key: string): Promise<TitlePreview | null> {
  const [mediaType, mediaId] = key.split(':');
  try {
    const raw = await tmdbFetch<{ poster_path?: string | null; title?: string; name?: string }>(
      `/${mediaType}/${mediaId}`,
    );
    return raw.poster_path ? { posterPath: raw.poster_path, title: raw.title ?? raw.name ?? '' } : null;
  } catch {
    return null;
  }
}

/**
 * Runtime in minutes for one `mediaType:mediaId`: movie runtime, or for a
 * series regular-season episodes × typical episode length (same estimate the
 * title page shows). Null when TMDB lacks the data. Same TMDB URL as
 * fetchPreview, so they share the fetch cache. Throws on fetch failure.
 */
async function fetchRuntime(key: string): Promise<number | null> {
  const [mediaType, mediaId] = key.split(':');
  const raw = await tmdbFetch<{
    runtime?: number | null;
    episode_run_time?: number[];
    last_episode_to_air?: { runtime?: number | null } | null;
    number_of_episodes?: number | null;
    seasons?: { season_number: number; episode_count: number | null }[];
  }>(`/${mediaType}/${mediaId}`);
  if (mediaType === 'movie') return raw.runtime || null;
  const perEpisode = raw.episode_run_time?.[0] || raw.last_episode_to_air?.runtime || null;
  const regular = (raw.seasons ?? []).filter((s) => s.season_number > 0);
  const episodes = regular.length
    ? regular.reduce((n, s) => n + (s.episode_count ?? 0), 0)
    : (raw.number_of_episodes ?? 0);
  return perEpisode && episodes ? perEpisode * episodes : null;
}

export type ListRuntime = { totalMinutes: number; watchedMinutes: number };

class PartialRuntimeError extends Error {
  constructor(readonly result: Record<string, ListRuntime>) {
    super('partial runtime totals');
  }
}

/**
 * Total and watched (finished / rewatch) runtime per list for a user, keyed
 * by watchlist id. One TMDB detail per unique title (8 at a time), cached
 * per user under the library tag — every item add / remove / status change
 * already busts it. A build with TMDB failures is returned, not cached.
 */
export async function getWatchlistRuntimes(userId: string): Promise<Record<string, ListRuntime>> {
  const cached = unstable_cache(
    async () => {
      const rows = await db
        .select({
          watchlistId: watchlistItems.watchlistId,
          mediaType: watchlistItems.mediaType,
          mediaId: watchlistItems.mediaId,
          status: watchlistItems.status,
        })
        .from(watchlistItems)
        .innerJoin(watchlists, eq(watchlists.id, watchlistItems.watchlistId))
        .where(eq(watchlists.userId, userId));

      const keys = [...new Set(rows.map((r) => `${r.mediaType}:${r.mediaId}`))];
      let failed = 0;
      const minutes = await mapWithConcurrency(keys, 8, (k) =>
        fetchRuntime(k).catch(() => {
          failed++;
          return null;
        }),
      );
      const byKey = new Map(keys.map((k, i) => [k, minutes[i] ?? 0]));

      const result: Record<string, ListRuntime> = {};
      for (const r of rows) {
        const m = byKey.get(`${r.mediaType}:${r.mediaId}`) ?? 0;
        const acc = (result[r.watchlistId] ??= { totalMinutes: 0, watchedMinutes: 0 });
        acc.totalMinutes += m;
        if (isWatchedStatus(r.status)) acc.watchedMinutes += m;
      }
      if (failed > 0) throw new PartialRuntimeError(result);
      return result;
    },
    ['watchlist-runtimes', userId],
    { revalidate: 3600, tags: [libraryTag(userId)] },
  );
  try {
    return await cached();
  } catch (err) {
    if (err instanceof PartialRuntimeError) return err.result;
    throw err;
  }
}

const PREVIEW_LIMIT = 100;

/**
 * Every item's poster + title for one of the user's lists, in list order —
 * the watchlists page loads these on first hover to scrub past the initial
 * previews. Capped at PREVIEW_LIMIT, TMDB lookups at most 8 at a time.
 */
export async function getWatchlistPreviews(watchlistId: string, userId: string): Promise<TitlePreview[]> {
  await requireOwnedWatchlist(watchlistId, userId);
  const items = await db
    .select({ mediaType: watchlistItems.mediaType, mediaId: watchlistItems.mediaId })
    .from(watchlistItems)
    .where(eq(watchlistItems.watchlistId, watchlistId))
    .orderBy(desc(watchlistItems.sortOrder), desc(watchlistItems.createdAt))
    .limit(PREVIEW_LIMIT);
  const previews = await mapWithConcurrency(items, 8, (it) => fetchPreview(`${it.mediaType}:${it.mediaId}`));
  return previews.filter((p): p is TitlePreview => p !== null);
}

/**
 * For each list, fetch the top-N items and resolve their TMDB poster paths.
 * Same (mediaType, mediaId) is fetched only once across all lists. Cached by
 * `tmdbFetch`'s default 1h revalidate.
 */
async function attachPosters(
  rows: WatchlistAggregate[],
  count: number = THUMBNAIL_POSTER_COUNT,
): Promise<WatchlistWithCount[]> {
  if (rows.length === 0) return [];

  // Top N items per list in ONE query (row_number per list) instead of one
  // query per list — a user with 12 lists was paying 12 DB round-trips.
  const ranked = db
    .select({
      watchlistId: watchlistItems.watchlistId,
      mediaType: watchlistItems.mediaType,
      mediaId: watchlistItems.mediaId,
      rn: sql<number>`row_number() over (partition by ${watchlistItems.watchlistId} order by ${watchlistItems.sortOrder} desc, ${watchlistItems.createdAt} desc)`.as('rn'),
    })
    .from(watchlistItems)
    .where(inArray(watchlistItems.watchlistId, rows.map((r) => r.id)))
    .as('ranked');

  const topItems = await db
    .select({
      watchlistId: ranked.watchlistId,
      mediaType: ranked.mediaType,
      mediaId: ranked.mediaId,
    })
    .from(ranked)
    .where(lte(ranked.rn, count))
    .orderBy(ranked.watchlistId, ranked.rn);

  const topByList = new Map<string, typeof topItems>();
  for (const it of topItems) {
    const list = topByList.get(it.watchlistId) ?? [];
    list.push(it);
    topByList.set(it.watchlistId, list);
  }
  const itemsByList = rows.map((row) => topByList.get(row.id) ?? []);

  // Resolve each unique (mediaType, mediaId) once.
  const uniqueKeys = new Set<string>();
  for (const items of itemsByList) {
    for (const it of items) uniqueKeys.add(`${it.mediaType}:${it.mediaId}`);
  }

  const previewByKey = new Map<string, TitlePreview | null>();
  await Promise.all(
    Array.from(uniqueKeys).map(async (key) => {
      previewByKey.set(key, await fetchPreview(key));
    }),
  );

  return rows.map((row, i) => {
    const previews = itemsByList[i]
      .map((it) => previewByKey.get(`${it.mediaType}:${it.mediaId}`) ?? null)
      .filter((p): p is TitlePreview => p !== null);
    return {
      ...row,
      posterPaths: previews.slice(0, THUMBNAIL_POSTER_COUNT).map((p) => p.posterPath),
      previews,
    };
  });
}

export async function getWatchlist(
  watchlistId: string,
  viewerId: string | null,
): Promise<{
  watchlist: Watchlist;
  items: WatchlistItem[];
  isOwner: boolean;
  owner: WatchlistOwner;
}> {
  const watchlist = await db.query.watchlists.findFirst({
    where: eq(watchlists.id, watchlistId),
  });

  if (!watchlist) throw new NotFoundAppError('Watchlist not found');

  const isOwner = viewerId !== null && watchlist.userId === viewerId;
  if (!isOwner && !watchlist.isPublic) {
    throw new ForbiddenAppError('Watchlist is private');
  }

  // Owner and items only depend on the (already access-checked) list row,
  // so load them concurrently.
  const [ownerRow, items] = await Promise.all([
    db
      .select({
        id: users.id,
        username: users.username,
        firstName: users.firstName,
        lastName: users.lastName,
        usersAvatarUrl: users.avatarUrl,
        displayName: userProfiles.displayName,
        profileAvatarUrl: userProfiles.avatarUrl,
        accentColor: userProfiles.accentColor,
      })
      .from(users)
      .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
      .where(eq(users.id, watchlist.userId))
      .limit(1)
      .then((rows) => rows[0]),
    db
      .select()
      .from(watchlistItems)
      .where(eq(watchlistItems.watchlistId, watchlistId))
      // Unranked ("Recently Added", rankedAt null) items are pinned on top.
      // Then sortOrder, the explicit manual ordering (set by reorder + addItem):
      // higher = top. createdAt-desc breaks ties for items that share an order.
      .orderBy(
        sql`${watchlistItems.rankedAt} is not null`,
        desc(watchlistItems.sortOrder),
        desc(watchlistItems.createdAt),
      ),
  ]);

  if (!ownerRow) throw new NotFoundAppError('Watchlist owner not found');

  const owner: WatchlistOwner = {
    id: ownerRow.id,
    username: ownerRow.username,
    firstName: ownerRow.firstName,
    lastName: ownerRow.lastName,
    displayName: ownerRow.displayName ?? '',
    avatarUrl: ownerRow.profileAvatarUrl || ownerRow.usersAvatarUrl || '',
    accentColor: ownerRow.accentColor ?? null,
  };

  return { watchlist, items, isOwner, owner };
}

// ---------------------------------------------------------------------------
// Item add/remove
// ---------------------------------------------------------------------------

export async function addItem(
  watchlistId: string,
  userId: string,
  mediaType: WatchlistMediaType,
  mediaId: string,
): Promise<WatchlistItem | null> {
  await requireVerifiedOrInGrace(userId);
  const watchlist = await requireOwnedWatchlist(watchlistId, userId);

  const nextOrder = await nextSortOrder(watchlistId);

  const [row] = await db
    .insert(watchlistItems)
    .values({ watchlistId, mediaType, mediaId, sortOrder: nextOrder })
    .onConflictDoNothing({
      target: [
        watchlistItems.watchlistId,
        watchlistItems.mediaType,
        watchlistItems.mediaId,
      ],
    })
    .returning();

  if (row) {
    invalidateForYouPool(userId);
    invalidateNewFeed(userId);
    await recordActivity(userId, {
      type: 'watchlist_add',
      payload: {
        watchlistId,
        watchlistName: watchlist.name,
        mediaType,
        mediaId,
      },
    });
  }

  return row ?? null;
}

/**
 * Bulk-add multiple items to a watchlist. Existing items (same mediaType +
 * mediaId) are silently skipped via the unique index. Returns the number
 * of items actually inserted.
 */
export async function bulkAddItems(
  watchlistId: string,
  userId: string,
  items: Array<{ mediaType: WatchlistMediaType; mediaId: string }>,
): Promise<number> {
  const watchlist = await requireOwnedWatchlist(watchlistId, userId);
  if (items.length === 0) return 0;

  const startOrder = await nextSortOrder(watchlistId);

  // Assign descending sortOrders so the first item in `items` ends up at the
  // top of the list (highest sortOrder).
  const rows = items.map((it, i) => ({
    watchlistId,
    mediaType: it.mediaType,
    mediaId: it.mediaId,
    sortOrder: startOrder + items.length - 1 - i,
  }));

  const inserted = await db
    .insert(watchlistItems)
    .values(rows)
    .onConflictDoNothing({
      target: [
        watchlistItems.watchlistId,
        watchlistItems.mediaType,
        watchlistItems.mediaId,
      ],
    })
    .returning({ id: watchlistItems.id, mediaType: watchlistItems.mediaType, mediaId: watchlistItems.mediaId });

  if (inserted.length > 0) {
    invalidateForYouPool(userId);
    invalidateNewFeed(userId);
    await recordActivity(userId, {
      type: 'watchlist_bulk_add',
      payload: {
        watchlistId,
        watchlistName: watchlist.name,
        count: inserted.length,
        items: inserted.map((r) => ({ mediaType: r.mediaType, mediaId: r.mediaId })),
      },
    });
  }

  return inserted.length;
}

/**
 * Bulk-add every part of a TMDB collection as movie items. Existing items
 * are skipped via the unique index. Returns the number actually inserted.
 */
export async function bulkAddCollectionParts(
  watchlistId: string,
  userId: string,
  collectionId: string | number,
): Promise<number> {
  await requireOwnedWatchlist(watchlistId, userId);

  const data = await tmdbFetch<{ parts: Array<{ id: number }> }>(
    `/collection/${collectionId}`,
  );

  const items = data.parts.map((p) => ({
    mediaType: 'movie' as const,
    mediaId: String(p.id),
  }));

  return bulkAddItems(watchlistId, userId, items);
}

/**
 * Persist a new visual order for the entire list. `orderedIds` lists item
 * UUIDs from top to bottom. We assign descending sortOrders so the first
 * id gets the highest sortOrder. `rankedItemId` (the item just dragged) is
 * marked ranked if it wasn't already, which moves it out of "Recently Added".
 */
export async function reorderItems(
  watchlistId: string,
  userId: string,
  orderedIds: string[],
  rankedItemId?: string,
): Promise<void> {
  const parsed = reorderItemsSchema.safeParse({ orderedIds, rankedItemId });
  if (!parsed.success) {
    throw new ValidationAppError('Invalid reorder input', parsed.error.flatten());
  }
  await requireOwnedWatchlist(watchlistId, userId);
  if (orderedIds.length === 0) return;

  await db.transaction(async (tx) => {
    if (rankedItemId) {
      await tx
        .update(watchlistItems)
        .set({ rankedAt: new Date() })
        .where(
          and(
            eq(watchlistItems.id, rankedItemId),
            eq(watchlistItems.watchlistId, watchlistId),
            isNull(watchlistItems.rankedAt),
          ),
        );
    }

    await writeSortOrders(tx, watchlistId, orderedIds);
  });
}

/**
 * Set one item's rank. 0 = unranked (back to "Recently Added", pinned on
 * top); 1..n = that position among ranked items, where n is the number of
 * items in the list. The new order is computed here from the stored order,
 * not trusted from the client.
 */
export async function setItemRank(
  watchlistId: string,
  userId: string,
  itemId: string,
  rank: number,
): Promise<void> {
  const parsed = setItemRankSchema.safeParse({ itemId, rank });
  if (!parsed.success) {
    throw new ValidationAppError('Invalid rank input', parsed.error.flatten());
  }
  await requireOwnedWatchlist(watchlistId, userId);

  await db.transaction(async (tx) => {
    // Same ordering as getWatchlist: unranked first, then by sortOrder.
    const rows = await tx
      .select({ id: watchlistItems.id, rankedAt: watchlistItems.rankedAt })
      .from(watchlistItems)
      .where(eq(watchlistItems.watchlistId, watchlistId))
      .orderBy(
        sql`${watchlistItems.rankedAt} is not null`,
        desc(watchlistItems.sortOrder),
        desc(watchlistItems.createdAt),
      );

    const target = rows.find((r) => r.id === itemId);
    if (!target) throw new NotFoundAppError('Watchlist item not found');
    if (rank > rows.length) {
      throw new ValidationAppError(`Rank must be between 0 and ${rows.length}`);
    }

    await tx
      .update(watchlistItems)
      .set({ rankedAt: rank === 0 ? null : (target.rankedAt ?? new Date()) })
      .where(eq(watchlistItems.id, itemId));

    const ordered = placeAtRank(rows, itemId, rank, (r) => r.rankedAt !== null);
    await writeSortOrders(
      tx,
      watchlistId,
      ordered.map((r) => r.id),
    );
  });
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** `orderedIds` top to bottom → descending sortOrders (first id = highest). */
async function writeSortOrders(
  tx: Tx,
  watchlistId: string,
  orderedIds: string[],
): Promise<void> {
  for (let i = 0; i < orderedIds.length; i++) {
    const sortOrder = orderedIds.length - 1 - i;
    await tx
      .update(watchlistItems)
      .set({ sortOrder, updatedAt: new Date() })
      .where(
        and(
          eq(watchlistItems.id, orderedIds[i]),
          eq(watchlistItems.watchlistId, watchlistId),
        ),
      );
  }
}

async function nextSortOrder(watchlistId: string): Promise<number> {
  const [row] = await db
    .select({
      max: sql<number | null>`max(${watchlistItems.sortOrder})`,
    })
    .from(watchlistItems)
    .where(eq(watchlistItems.watchlistId, watchlistId));
  return (row?.max ?? -1) + 1;
}

export async function removeItem(
  watchlistId: string,
  userId: string,
  mediaType: WatchlistMediaType,
  mediaId: string,
): Promise<void> {
  await requireOwnedWatchlist(watchlistId, userId);

  await db
    .delete(watchlistItems)
    .where(
      and(
        eq(watchlistItems.watchlistId, watchlistId),
        eq(watchlistItems.mediaType, mediaType),
        eq(watchlistItems.mediaId, mediaId),
      ),
    );
  // A removal leaves no item row behind to carry its timestamp, so bump the
  // list itself; listWatchlists' lastActivityAt then reflects it.
  await db
    .update(watchlists)
    .set({ updatedAt: new Date() })
    .where(eq(watchlists.id, watchlistId));
  invalidateForYouPool(userId);
  invalidateNewFeed(userId);
}

/**
 * Update the status of a single watchlist item, with the journey timestamps
 * from `journeyPatch` (started_at / finished_at rules).
 *
 * Ownership is verified via a subquery on the parent watchlist.
 */
export async function updateItemStatus(
  userId: string,
  itemId: string,
  status: WatchlistItemStatus,
): Promise<void> {
  const parsed = updateItemStatusSchema.safeParse({ itemId, status });
  if (!parsed.success) {
    throw new ValidationAppError('Invalid status input', parsed.error.flatten());
  }

  // Read the current row (owner-gated) so we know whether the user is
  // entering / leaving the watching or finished states. Bundled into a single
  // transaction to avoid TOCTOU.
  await db.transaction(async (tx) => {
    const [current] = await tx
      .select({
        status: watchlistItems.status,
        startedAt: watchlistItems.startedAt,
      })
      .from(watchlistItems)
      .innerJoin(watchlists, eq(watchlists.id, watchlistItems.watchlistId))
      .where(
        and(
          eq(watchlistItems.id, parsed.data.itemId),
          eq(watchlists.userId, userId),
        ),
      )
      .limit(1);

    if (!current) throw new NotFoundAppError('Watchlist item not found');

    await tx
      .update(watchlistItems)
      .set(journeyPatch(current, parsed.data.status, new Date()))
      .where(eq(watchlistItems.id, parsed.data.itemId));
  });
  invalidateForYouPool(userId);
  invalidateNewFeed(userId);
}

/**
 * Set or clear the per-item notes field. Pass `null` (or an empty string,
 * which we normalize to null) to clear.
 */
export async function updateItemNotes(
  userId: string,
  itemId: string,
  notes: string | null,
): Promise<void> {
  // Treat empty string as a clear so the UI's textarea-on-blur path doesn't
  // leave behind a row with notes=''.
  const normalized = notes && notes.trim().length > 0 ? notes.trim() : null;

  const parsed = updateItemNotesSchema.safeParse({ itemId, notes: normalized });
  if (!parsed.success) {
    throw new ValidationAppError('Invalid notes input', parsed.error.flatten());
  }

  const result = await db
    .update(watchlistItems)
    .set({ notes: parsed.data.notes, updatedAt: new Date() })
    .where(
      and(
        eq(watchlistItems.id, parsed.data.itemId),
        sql`${watchlistItems.watchlistId} IN (SELECT ${watchlists.id} FROM ${watchlists} WHERE ${watchlists.userId} = ${userId})`,
      ),
    )
    .returning({ id: watchlistItems.id });

  if (result.length === 0) {
    throw new NotFoundAppError('Watchlist item not found');
  }
}

/**
 * Returns the set of watchlist IDs containing the given item for this user.
 * Used to render checkbox state in the "Add to Watchlist" picker.
 */
export async function getWatchlistsContainingItem(
  userId: string,
  mediaType: WatchlistMediaType,
  mediaId: string,
): Promise<string[]> {
  const rows = await db
    .select({ watchlistId: watchlistItems.watchlistId })
    .from(watchlistItems)
    .innerJoin(watchlists, eq(watchlists.id, watchlistItems.watchlistId))
    .where(
      and(
        eq(watchlists.userId, userId),
        eq(watchlistItems.mediaType, mediaType),
        eq(watchlistItems.mediaId, mediaId),
      ),
    );

  return rows.map((r) => r.watchlistId);
}

/**
 * Whether a title is in ANY of the user's watchlists — a cheap EXISTS-style
 * check (limit 1) used to seed the "Added to Watchlist" button state.
 */
export async function isInAnyWatchlist(
  userId: string,
  mediaType: WatchlistMediaType,
  mediaId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: watchlistItems.id })
    .from(watchlistItems)
    .innerJoin(watchlists, eq(watchlists.id, watchlistItems.watchlistId))
    .where(
      and(
        eq(watchlists.userId, userId),
        eq(watchlistItems.mediaType, mediaType),
        eq(watchlistItems.mediaId, mediaId),
      ),
    )
    .limit(1);

  return row != null;
}

// ---------------------------------------------------------------------------
// Default / smart add
// ---------------------------------------------------------------------------

/**
 * Returns the user's existing default-ish watchlist or creates one.
 * Used as a safety net (auto-create on signup should normally cover this).
 */
export async function getOrCreateDefaultWatchlist(
  userId: string,
): Promise<Watchlist> {
  const existing = await db.query.watchlists.findFirst({
    where: eq(watchlists.userId, userId),
    orderBy: (w, { asc }) => [asc(w.createdAt)],
  });
  if (existing) return existing;

  return createWatchlist(userId, { name: DEFAULT_WATCHLIST_NAME });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function requireOwnedWatchlist(
  watchlistId: string,
  userId: string,
): Promise<Watchlist> {
  const watchlist = await db.query.watchlists.findFirst({
    where: eq(watchlists.id, watchlistId),
  });
  if (!watchlist) throw new NotFoundAppError('Watchlist not found');
  if (watchlist.userId !== userId) {
    throw new ForbiddenAppError('You do not own this watchlist');
  }
  return watchlist;
}
