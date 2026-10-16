import { db } from '@/db';
import { watchlists, watchlistItems, users, userProfiles } from '@/db/schema';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { tmdbFetch } from '@/server/tmdb/client';
import { recordActivity } from '@/services/activity/record';
import {
  createWatchlistSchema,
  updateWatchlistSchema,
  updateItemStatusSchema,
  updateItemNotesSchema,
  reorderItemsSchema,
  setItemRankSchema,
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
}

type WatchlistAggregate = Omit<WatchlistWithCount, 'posterPaths'>;

export async function listWatchlists(
  userId: string,
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
    })
    .from(watchlists)
    .leftJoin(watchlistItems, eq(watchlistItems.watchlistId, watchlists.id))
    .where(eq(watchlists.userId, userId))
    .groupBy(watchlists.id)
    .orderBy(desc(watchlists.updatedAt));

  return attachPosters(rows);
}

/** Public-only watchlists for a user. Used by `/user/[username]`. */
export async function listPublicWatchlists(
  userId: string,
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
    })
    .from(watchlists)
    .leftJoin(watchlistItems, eq(watchlistItems.watchlistId, watchlists.id))
    .where(and(eq(watchlists.userId, userId), eq(watchlists.isPublic, true)))
    .groupBy(watchlists.id)
    .orderBy(desc(watchlists.updatedAt));

  return attachPosters(rows);
}

/**
 * For each list, fetch the top-N items and resolve their TMDB poster paths.
 * Same (mediaType, mediaId) is fetched only once across all lists. Cached by
 * `tmdbFetch`'s default 1h revalidate.
 */
async function attachPosters(
  rows: WatchlistAggregate[],
): Promise<WatchlistWithCount[]> {
  if (rows.length === 0) return [];

  // Top N items per list in parallel.
  const itemsByList = await Promise.all(
    rows.map((row) =>
      db
        .select({
          mediaType: watchlistItems.mediaType,
          mediaId: watchlistItems.mediaId,
        })
        .from(watchlistItems)
        .where(eq(watchlistItems.watchlistId, row.id))
        .orderBy(
          desc(watchlistItems.sortOrder),
          desc(watchlistItems.createdAt),
        )
        .limit(THUMBNAIL_POSTER_COUNT),
    ),
  );

  // Resolve each unique (mediaType, mediaId) once.
  const uniqueKeys = new Set<string>();
  for (const items of itemsByList) {
    for (const it of items) uniqueKeys.add(`${it.mediaType}:${it.mediaId}`);
  }

  const posterByKey = new Map<string, string | null>();
  await Promise.all(
    Array.from(uniqueKeys).map(async (key) => {
      const [mediaType, mediaId] = key.split(':');
      try {
        const raw = await tmdbFetch<{ poster_path?: string | null }>(
          `/${mediaType}/${mediaId}`,
        );
        posterByKey.set(key, raw.poster_path ?? null);
      } catch {
        posterByKey.set(key, null);
      }
    }),
  );

  return rows.map((row, i) => ({
    ...row,
    posterPaths: itemsByList[i]
      .map((it) => posterByKey.get(`${it.mediaType}:${it.mediaId}`) ?? null)
      .filter((p): p is string => Boolean(p)),
  }));
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

  const ownerRow = await db
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
    .then((rows) => rows[0]);

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

  const items = await db
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
    );

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
    .returning({ id: watchlistItems.id });

  if (inserted.length > 0) {
    await recordActivity(userId, {
      type: 'watchlist_bulk_add',
      payload: {
        watchlistId,
        watchlistName: watchlist.name,
        count: inserted.length,
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
}

// Set of statuses that mark "the user has started watching". First entry
// into any of these sets started_at; staying within the set leaves it alone.
const WATCHING_STATUSES: ReadonlySet<WatchlistItemStatus> = new Set([
  'watching',
  'rewatch',
]);

/**
 * Update the status of a single watchlist item. Also manages the journey
 * timestamps:
 *   - started_at: set on first transition INTO watching/rewatch (if not already
 *     set). Never cleared — so "started X ago" stays stable across pauses.
 *   - finished_at: set on transition INTO finished. Cleared on transition OUT
 *     of finished (e.g. user marks as rewatch).
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

    const now = new Date();
    const next = parsed.data.status;

    const setStartedAt =
      !current.startedAt && WATCHING_STATUSES.has(next) ? now : undefined;
    const isEnteringFinished =
      next === 'finished' && current.status !== 'finished';
    const isLeavingFinished =
      next !== 'finished' && current.status === 'finished';

    await tx
      .update(watchlistItems)
      .set({
        status: next,
        ...(setStartedAt && { startedAt: setStartedAt }),
        ...(isEnteringFinished && { finishedAt: now }),
        ...(isLeavingFinished && { finishedAt: null }),
        updatedAt: now,
      })
      .where(eq(watchlistItems.id, parsed.data.itemId));
  });
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
