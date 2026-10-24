import 'server-only';

import { z } from 'zod';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { watchedTitles, watchlistItems, watchlists } from '@/db/schema';
import { ValidationAppError } from '@/utils/errors';
import { invalidateForYouPool } from '@/services/forYou/cacheTag';
import { invalidateNewFeed } from '@/services/newReleases/cacheTag';
import { journeyPatch } from './journey';
import { logWatchlistEvent } from './events';
import type { WatchlistItemStatus } from './validators';

/**
 * Tidy up: apply one choice to one or more of the owner's items in a single
 * transaction, and hand back a snapshot of the rows as they were, so Undo
 * puts them back exactly (status, dates, rank, notes; removed rows come back
 * with the same id). Ownership is checked in the query, never trusted from
 * the client. Ranks (sort_order, ranked_at) are never touched by a choice.
 */

const STATUSES = ['just_added', 'up_next', 'watching', 'waiting_for_episode', 'waiting_for_season', 'paused', 'finished', 'rewatch', 'dropped'] as const;

export const TIDY_ACTIONS = ['finish', 'watching', 'up_next', 'pause', 'drop', 'keep', 'remove'] as const;
export type TidyAction = (typeof TIDY_ACTIONS)[number];

const TO_STATUS: Partial<Record<TidyAction, WatchlistItemStatus>> = {
  finish: 'finished',
  watching: 'watching',
  up_next: 'up_next',
  pause: 'paused',
  drop: 'dropped',
};

const applySchema = z.object({
  action: z.enum(TIDY_ACTIONS),
  itemIds: z.array(z.string().uuid()).min(1).max(200),
  /** What prompted it (the suggestion kind), for the event log only. */
  kind: z.string().max(20).optional(),
});

const iso = z.string().datetime({ offset: true }).nullable();
const snapshotRowSchema = z.object({
  id: z.string().uuid(),
  watchlistId: z.string().uuid(),
  mediaType: z.enum(['movie', 'tv']),
  mediaId: z.string().regex(/^\d{1,12}$/),
  status: z.enum(STATUSES),
  startedAt: iso,
  finishedAt: iso,
  keptAt: iso,
  notes: z.string().max(5000).nullable(),
  sortOrder: z.number().int(),
  rankedAt: iso,
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});
export type TidySnapshotRow = z.infer<typeof snapshotRowSchema>;
export interface TidySnapshot {
  action: TidyAction;
  rows: TidySnapshotRow[];
}
const undoSchema = z.object({ action: z.enum(TIDY_ACTIONS), rows: z.array(snapshotRowSchema).min(1).max(200) });

const toIso = (d: Date | null) => (d ? d.toISOString() : null);
const toDate = (s: string | null) => (s ? new Date(s) : null);

export async function applyTidy(userId: string, input: unknown): Promise<TidySnapshot> {
  const parsed = applySchema.safeParse(input);
  if (!parsed.success) throw new ValidationAppError('Invalid tidy request', parsed.error.flatten());
  const { action, itemIds, kind } = parsed.data;

  const rows = await db.transaction(async (tx) => {
    const owned = await tx
      .select({
        id: watchlistItems.id,
        watchlistId: watchlistItems.watchlistId,
        mediaType: watchlistItems.mediaType,
        mediaId: watchlistItems.mediaId,
        status: watchlistItems.status,
        startedAt: watchlistItems.startedAt,
        finishedAt: watchlistItems.finishedAt,
        keptAt: watchlistItems.keptAt,
        notes: watchlistItems.notes,
        sortOrder: watchlistItems.sortOrder,
        rankedAt: watchlistItems.rankedAt,
        createdAt: watchlistItems.createdAt,
        updatedAt: watchlistItems.updatedAt,
      })
      .from(watchlistItems)
      .innerJoin(watchlists, eq(watchlists.id, watchlistItems.watchlistId))
      .where(and(eq(watchlists.userId, userId), inArray(watchlistItems.id, itemIds)));
    if (!owned.length) return owned;

    const now = new Date();
    const status = TO_STATUS[action];
    if (status) {
      // Marking finished uses the date they logged it in Seen it, when there is one.
      const logged =
        action === 'finish'
          ? new Map(
              (
                await tx
                  .select({ mediaType: watchedTitles.mediaType, mediaId: watchedTitles.mediaId, watchedAt: watchedTitles.watchedAt })
                  .from(watchedTitles)
                  .where(and(eq(watchedTitles.userId, userId), inArray(watchedTitles.mediaId, owned.map((r) => r.mediaId))))
              ).map((w) => [`${w.mediaType}:${w.mediaId}`, w.watchedAt]),
            )
          : null;
      for (const r of owned) {
        const finishedAt = logged?.get(`${r.mediaType}:${r.mediaId}`) ?? undefined;
        await tx.update(watchlistItems).set(journeyPatch(r, status, now, finishedAt ?? undefined)).where(eq(watchlistItems.id, r.id));
      }
    } else if (action === 'keep') {
      await tx.update(watchlistItems).set({ keptAt: now }).where(inArray(watchlistItems.id, owned.map((r) => r.id)));
    } else if (action === 'remove') {
      await tx.delete(watchlistItems).where(inArray(watchlistItems.id, owned.map((r) => r.id)));
    }
    // The lists' own "updated" moves for changes the member made, not for a Keep.
    if (action !== 'keep') {
      await tx.update(watchlists).set({ updatedAt: now }).where(inArray(watchlists.id, [...new Set(owned.map((r) => r.watchlistId))]));
    }
    return owned;
  });

  if (rows.length && action !== 'keep') {
    invalidateForYouPool(userId);
    invalidateNewFeed(userId);
  }
  void logWatchlistEvent(userId, 'tidy_action', { action, kind: kind ?? null, count: rows.length });

  return {
    action,
    rows: rows.map((r) => ({
      ...r,
      startedAt: toIso(r.startedAt),
      finishedAt: toIso(r.finishedAt),
      keptAt: toIso(r.keptAt),
      rankedAt: toIso(r.rankedAt),
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })),
  };
}

/**
 * Puts rows back as the snapshot had them. Every row's list must be the
 * caller's; a removed row is re-inserted with its id, rank and notes (if the
 * title was re-added meanwhile, that newer row wins and nothing is doubled).
 */
export async function undoTidy(userId: string, input: unknown): Promise<{ restored: number }> {
  const parsed = undoSchema.safeParse(input);
  if (!parsed.success) throw new ValidationAppError('Invalid undo', parsed.error.flatten());
  const { action, rows } = parsed.data;

  const listIds = [...new Set(rows.map((r) => r.watchlistId))];
  const mine = await db.select({ id: watchlists.id }).from(watchlists).where(and(eq(watchlists.userId, userId), inArray(watchlists.id, listIds)));
  if (mine.length !== listIds.length) throw new ValidationAppError('Invalid undo');

  await db.transaction(async (tx) => {
    for (const r of rows) {
      const fields = {
        status: r.status,
        startedAt: toDate(r.startedAt),
        finishedAt: toDate(r.finishedAt),
        keptAt: toDate(r.keptAt),
        notes: r.notes,
        sortOrder: r.sortOrder,
        rankedAt: toDate(r.rankedAt),
        updatedAt: new Date(r.updatedAt),
      };
      if (action === 'remove') {
        await tx
          .insert(watchlistItems)
          .values({ id: r.id, watchlistId: r.watchlistId, mediaType: r.mediaType, mediaId: r.mediaId, createdAt: new Date(r.createdAt), ...fields })
          .onConflictDoNothing();
      } else {
        await tx.update(watchlistItems).set(fields).where(and(eq(watchlistItems.id, r.id), inArray(watchlistItems.watchlistId, listIds)));
      }
    }
  });

  if (action !== 'keep') {
    invalidateForYouPool(userId);
    invalidateNewFeed(userId);
  }
  void logWatchlistEvent(userId, 'tidy_undo', { action, count: rows.length });
  return { restored: rows.length };
}
