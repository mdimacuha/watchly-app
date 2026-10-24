'use server';

import { cookies } from 'next/headers';
import { getFavoriteKeysInWatchlist } from '@/services/favorites';
import { getSession } from '@/server/auth/session';
import { ZodError } from 'zod';
import { AppError, UnauthorizedAppError } from '@/utils/errors';
import { revalidatePath } from 'next/cache';
import { getUserRegion } from '@/services/preferences';
import {
  createWatchlist,
  updateWatchlist,
  deleteWatchlist,
  listWatchlists,
  getWatchlist,
  addItem,
  removeItem,
  updateItemStatus,
  updateItemNotes,
  getWatchlistsContainingItem,
  getWatchlistPreviews,
  getOrCreateDefaultWatchlist,
  bulkAddCollectionParts,
  reorderItems,
  setItemRank,
  isInAnyWatchlist,
  type WatchlistMediaType,
  type WatchlistItemStatus,
} from '@/services/watchlists';
import { enrichWatchlistItems } from '@/services/watchlists/enrich';
import { dismissAttention, getAttention } from '@/services/watchlists/attention';
import { applyTidy, undoTidy, type TidyAction, type TidySnapshot } from '@/services/watchlists/tidy';
import { logWatchlistEvent, recordWatchlistEvent } from '@/services/watchlists/events';
import { getListRecs } from '@/services/watchlists/recs';
import { getWatchlistQuickLook, type WatchlistQuickLook } from '@/services/watchlists/quickLook';
import {
  toggleWatchlistUpvote,
  getWatchlistVoteState,
  type WatchlistVoteState,
  type ToggleVoteResult,
} from '@/services/watchlists/votes';
import type {
  CreateWatchlistInput,
  UpdateWatchlistInput,
} from '@/services/watchlists/validators';

async function requireUserId(): Promise<string> {
  const session = await getSession();
  if (!session) throw new UnauthorizedAppError();
  return session.userId;
}

/**
 * Read whether a title is in ANY of the current user's watchlists. Used by
 * <AddToWatchlistButton fetchInitial /> on ISR-cached public pages, where the
 * membership can no longer be passed as a server prop. Returns false for
 * logged-out users (the button only renders when authed).
 */
export async function isInAnyWatchlistAction(
  mediaType: WatchlistMediaType,
  mediaId: string,
): Promise<boolean> {
  const session = await getSession();
  if (!session) return false;
  return isInAnyWatchlist(session.userId, mediaType, mediaId);
}

// ---------------------------------------------------------------------------
// Watchlist CRUD
// ---------------------------------------------------------------------------

export async function createWatchlistAction(input: CreateWatchlistInput) {
  const userId = await requireUserId();
  const row = await createWatchlist(userId, input);
  revalidatePath('/watchlists');
  return row;
}

export async function updateWatchlistAction(
  watchlistId: string,
  input: UpdateWatchlistInput,
) {
  const userId = await requireUserId();
  const row = await updateWatchlist(watchlistId, userId, input);
  revalidatePath('/watchlists');
  revalidatePath(`/watchlists/${watchlistId}`);
  return row;
}

export async function deleteWatchlistAction(watchlistId: string) {
  const userId = await requireUserId();
  await deleteWatchlist(watchlistId, userId);
  revalidatePath('/watchlists');
}

export async function listWatchlistsAction(opts: { previews?: number; runtimes?: boolean } = {}) {
  const userId = await requireUserId();
  return listWatchlists(userId, opts);
}

/** All items' poster + title for one of the viewer's lists (cover scrub). */
export async function getWatchlistPreviewsAction(watchlistId: string) {
  const userId = await requireUserId();
  return getWatchlistPreviews(watchlistId, userId);
}

export async function getEnrichedWatchlistAction(watchlistId: string) {
  // Public/unauthenticated viewers are allowed; the service returns the row
  // only if the viewer owns it OR the list is public.
  const session = await getSession();
  const viewerId = session?.userId ?? null;

  // Region, the list itself, and the viewer's favorites (heart state) are
  // independent reads — run them concurrently rather than one after another.
  // The favorites read only returns the viewer's own data, so it's safe to
  // start before getWatchlist has checked access (which throws if denied).
  const [region, { watchlist, items, isOwner, owner }, favoriteSet] =
    await Promise.all([
      resolveViewerRegion(viewerId),
      getWatchlist(watchlistId, viewerId),
      viewerId
        ? getFavoriteKeysInWatchlist(viewerId, watchlistId)
        : Promise.resolve(new Set<string>()),
    ]);

  const enriched = await enrichWatchlistItems(items, region, favoriteSet);
  return { watchlist, items: enriched, isOwner, owner };
}

/**
 * Watchlist Quick View. "unavailable" covers private, missing, and malformed
 * ids alike so a private list's existence isn't revealed; anything else
 * throws and the popup shows its retry state.
 */
export async function getWatchlistQuickLookAction(
  watchlistId: string,
): Promise<{ status: 'ok'; data: WatchlistQuickLook } | { status: 'unavailable' }> {
  const session = await getSession();
  try {
    return { status: 'ok', data: await getWatchlistQuickLook(watchlistId, session?.userId ?? null) };
  } catch (err) {
    if (err instanceof AppError || err instanceof ZodError) return { status: 'unavailable' };
    throw err;
  }
}

async function resolveViewerRegion(viewerId: string | null): Promise<string> {
  // Same priority used elsewhere: cookie → user pref → 'US'.
  const cookieStore = await cookies();
  const cookieRegion = cookieStore.get('watchly_region')?.value;
  if (cookieRegion) return cookieRegion;

  if (viewerId) {
    try {
      const pref = await getUserRegion(viewerId);
      if (pref) return pref;
    } catch {
      // fall through to fallback
    }
  }
  return 'US';
}

// ---------------------------------------------------------------------------
// Item add / remove
// ---------------------------------------------------------------------------

export async function addToWatchlistAction(
  watchlistId: string,
  mediaType: WatchlistMediaType,
  mediaId: string,
  /** Where the add came from ('search', 'recs', …), for the adds baseline. */
  source: string = 'other',
) {
  const userId = await requireUserId();
  const inserted = await addItem(watchlistId, userId, mediaType, mediaId);
  if (inserted !== null) void logWatchlistEvent(userId, 'title_added', { source: String(source).slice(0, 20), listId: watchlistId });
  revalidatePath(`/watchlists/${watchlistId}`);
  revalidatePath('/watchlists');
}

/**
 * Add a single item to several watchlists in one confirm step. Loops
 * `addItem` over each id; the service returns `null` when the item is already
 * present, so we count only the real insertions. Revalidates the watchlists
 * index and every affected list. Returns the number of lists the item was
 * newly added to (0 when everything was already present).
 */
export async function addToWatchlistsAction(
  mediaType: WatchlistMediaType,
  mediaId: string,
  watchlistIds: string[],
) {
  const userId = await requireUserId();
  let added = 0;
  for (const watchlistId of watchlistIds) {
    const inserted = await addItem(watchlistId, userId, mediaType, mediaId);
    if (inserted !== null) {
      added += 1;
      void logWatchlistEvent(userId, 'title_added', { source: 'picker', listId: watchlistId });
    }
    revalidatePath(`/watchlists/${watchlistId}`);
  }
  revalidatePath('/watchlists');
  return added;
}

export async function removeFromWatchlistAction(
  watchlistId: string,
  mediaType: WatchlistMediaType,
  mediaId: string,
) {
  const userId = await requireUserId();
  await removeItem(watchlistId, userId, mediaType, mediaId);
  revalidatePath(`/watchlists/${watchlistId}`);
  revalidatePath('/watchlists');
}

/**
 * Update the watching-journey status of a single item: Just Added /
 * Up Next / Watching / Finished.
 */
export async function updateItemStatusAction(
  watchlistId: string,
  itemId: string,
  status: WatchlistItemStatus,
) {
  const userId = await requireUserId();
  await updateItemStatus(userId, itemId, status);
  revalidatePath(`/watchlists/${watchlistId}`);
}

/**
 * Set or clear the per-item notes field. Empty string normalizes to null
 * inside the service so the textarea-on-blur path doesn't persist empties.
 */
export async function updateItemNotesAction(
  watchlistId: string,
  itemId: string,
  notes: string | null,
) {
  const userId = await requireUserId();
  await updateItemNotes(userId, itemId, notes);
  revalidatePath(`/watchlists/${watchlistId}`);
}

/**
 * Picker payload: lists with counts plus the subset that already contain the
 * given item. Used by the "Add to Watchlist" modal to render checkbox state.
 */
export async function getWatchlistsForPickerAction(
  mediaType: WatchlistMediaType,
  mediaId: string,
) {
  const userId = await requireUserId();
  const [lists, containing] = await Promise.all([
    listWatchlists(userId),
    getWatchlistsContainingItem(userId, mediaType, mediaId),
  ]);
  const containingSet = new Set(containing);
  return lists.map((l) => ({ ...l, containsItem: containingSet.has(l.id) }));
}

/**
 * Hybrid add:
 *  - Zero lists → `{ mode: 'picker' }`. We do NOT silently auto-create a
 *    default list; the picker renders its empty state + "create list" CTA so
 *    the user gets a real choice instead of a phantom "My Watchlist".
 *  - Exactly one list → direct add. `added` reflects whether the item was
 *    actually inserted (false when it was already on the list) so the caller
 *    can avoid a misleading "Added" toast for a duplicate.
 *  - Two or more → `{ mode: 'picker' }` so the UI can open the modal.
 */
export async function addToWatchlistSmartAction(
  mediaType: WatchlistMediaType,
  mediaId: string,
) {
  const userId = await requireUserId();
  const lists = await listWatchlists(userId);

  if (lists.length === 0) {
    return { mode: 'picker' as const };
  }

  if (lists.length === 1) {
    const watchlist = lists[0];
    const inserted = await addItem(watchlist.id, userId, mediaType, mediaId);
    if (inserted !== null) void logWatchlistEvent(userId, 'title_added', { source: 'quick-add', listId: watchlist.id });
    revalidatePath('/watchlists');
    revalidatePath(`/watchlists/${watchlist.id}`);
    return { mode: 'direct' as const, watchlist, added: inserted !== null };
  }

  return { mode: 'picker' as const };
}

// ---------------------------------------------------------------------------
// Collection bulk-add
// ---------------------------------------------------------------------------

/**
 * Bulk-add every part of a TMDB collection to a specific watchlist.
 * Returns the number of items inserted (duplicates are skipped).
 */
export async function addCollectionToWatchlistAction(
  watchlistId: string,
  collectionId: string,
) {
  const userId = await requireUserId();
  const added = await bulkAddCollectionParts(watchlistId, userId, collectionId);
  if (added) void logWatchlistEvent(userId, 'title_added', { source: 'collection', listId: watchlistId, count: added });
  revalidatePath(`/watchlists/${watchlistId}`);
  revalidatePath('/watchlists');
  return added;
}

/**
 * Hybrid bulk-add: if the user has ≤1 list, bulk-add directly (creating the
 * default list if needed). Otherwise returns `{ mode: 'picker' }` so the UI
 * can open a destination picker.
 */
export async function addCollectionToWatchlistSmartAction(collectionId: string) {
  const userId = await requireUserId();
  const lists = await listWatchlists(userId);

  if (lists.length <= 1) {
    const watchlist = lists[0] ?? (await getOrCreateDefaultWatchlist(userId));
    const added = await bulkAddCollectionParts(
      watchlist.id,
      userId,
      collectionId,
    );
    if (added) void logWatchlistEvent(userId, 'title_added', { source: 'collection', listId: watchlist.id, count: added });
    revalidatePath('/watchlists');
    revalidatePath(`/watchlists/${watchlist.id}`);
    return { mode: 'direct' as const, watchlist, added };
  }

  return { mode: 'picker' as const };
}

// ---------------------------------------------------------------------------
// Reorder
// ---------------------------------------------------------------------------

export async function reorderWatchlistItemsAction(
  watchlistId: string,
  orderedIds: string[],
  rankedItemId?: string,
) {
  const userId = await requireUserId();
  await reorderItems(watchlistId, userId, orderedIds, rankedItemId);
  revalidatePath(`/watchlists/${watchlistId}`);
}

/** Set an item's curator rank: 0 = unranked, 1..n = position. */
export async function setWatchlistItemRankAction(
  watchlistId: string,
  itemId: string,
  rank: number,
) {
  const userId = await requireUserId();
  await setItemRank(watchlistId, userId, itemId, rank);
  revalidatePath(`/watchlists/${watchlistId}`);
}

// ---------------------------------------------------------------------------
// Upvotes for public watchlists.
//
// Gated behind FEATURES.watchlistUpvoting at the render/call site (the detail
// client + card only mount the control, and only call these, when the flag is
// on) so an un-migrated `watchlist_votes` table is never queried while the flag
// is off. Mirrors the reviews feature's flag-gating approach.
// ---------------------------------------------------------------------------

/** Toggle the current user's upvote on a watchlist; returns fresh state. */
export async function toggleWatchlistUpvoteAction(
  watchlistId: string,
): Promise<ToggleVoteResult> {
  const userId = await requireUserId();
  const result = await toggleWatchlistUpvote(userId, watchlistId);
  revalidatePath('/watchlists');
  revalidatePath(`/watchlists/${watchlistId}`);
  return result;
}

/**
 * Read the vote count + whether the current viewer has upvoted. Public /
 * unauthenticated viewers are allowed (count only; `hasVoted` stays false).
 */
export async function getWatchlistVoteStateAction(
  watchlistId: string,
): Promise<WatchlistVoteState> {
  const session = await getSession();
  const viewerId = session?.userId ?? null;
  return getWatchlistVoteState(viewerId, watchlistId);
}

/**
 * What in the owner's lists needs their attention (all lists, or one with
 * `watchlistId`). Owner-only by construction: reads the session user's own
 * rows.
 */
export async function getAttentionAction(watchlistId?: string) {
  const userId = await requireUserId();
  const region = await resolveViewerRegion(userId);
  return getAttention(userId, region, { watchlistId });
}

/** Tidy up: one choice on one or more items, in one transaction. Returns the undo snapshot. */
export async function applyTidyAction(input: { action: TidyAction; itemIds: string[]; kind?: string }): Promise<TidySnapshot> {
  const userId = await requireUserId();
  const snapshot = await applyTidy(userId, input);
  for (const id of new Set(snapshot.rows.map((r) => r.watchlistId))) revalidatePath(`/watchlists/${id}`);
  revalidatePath('/watchlists');
  return snapshot;
}

/** Tidy up: put the rows back as the snapshot had them. */
export async function undoTidyAction(snapshot: TidySnapshot) {
  const userId = await requireUserId();
  const res = await undoTidy(userId, snapshot);
  for (const id of new Set(snapshot.rows.map((r) => r.watchlistId))) revalidatePath(`/watchlists/${id}`);
  revalidatePath('/watchlists');
  return res;
}

/** Hide the Needs-your-attention strip until its set of things changes. */
export async function dismissAttentionAction(fingerprint: string) {
  const userId = await requireUserId();
  await dismissAttention(userId, String(fingerprint));
}

/**
 * More for this list: the owner's picks for one list, made on first open of
 * the accordion (never before). Logs how many came back and how long it took.
 */
export async function getListRecsAction(watchlistId: string, round = 0) {
  const userId = await requireUserId();
  const region = await resolveViewerRegion(userId);
  const r = Number.isInteger(round) && round >= 0 && round <= 30 ? round : 0;
  const t0 = Date.now();
  const res = await getListRecs(userId, String(watchlistId), region, r);
  void logWatchlistEvent(userId, 'recs_shown', { listId: watchlistId, round: r, status: res.status, count: res.status === 'ok' ? res.picks.length : 0, ms: Date.now() - t0 });
  return res;
}

/** Page-reported events (strip shown, Tidy up / recs opened). Best-effort. */
export async function recordWatchlistEventAction(input: { event: 'attention_shown' | 'tidy_opened' | 'recs_opened'; metadata?: Record<string, unknown> }) {
  const userId = await requireUserId();
  await recordWatchlistEvent(userId, input);
}
