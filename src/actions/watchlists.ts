'use server';

import { cookies } from 'next/headers';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { userFavorites } from '@/db/schema';
import { getSession } from '@/server/auth/session';
import { UnauthorizedAppError } from '@/utils/errors';
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
  getOrCreateDefaultWatchlist,
  bulkAddCollectionParts,
  reorderItems,
  isInAnyWatchlist,
  type WatchlistMediaType,
  type WatchlistItemStatus,
} from '@/services/watchlists';
import { enrichWatchlistItems } from '@/services/watchlists/enrich';
import {
  toggleWatchlistUpvote,
  getWatchlistVoteState,
  type WatchlistVoteState,
  type ToggleVoteResult,
} from '@/services/watchlists/votes';
import {
  getWatchlistRecommendations,
  type RecommendationItem,
} from '@/services/tmdb/recommendations';
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

export async function listWatchlistsAction() {
  const userId = await requireUserId();
  return listWatchlists(userId);
}

export async function getEnrichedWatchlistAction(watchlistId: string) {
  // Public/unauthenticated viewers are allowed; the service returns the row
  // only if the viewer owns it OR the list is public.
  const session = await getSession();
  const viewerId = session?.userId ?? null;
  const region = await resolveViewerRegion(viewerId);
  const { watchlist, items, isOwner, owner } = await getWatchlist(
    watchlistId,
    viewerId,
  );

  // Build a (mediaType:mediaId) set of items the viewer has favorited so the
  // heart toggle renders the correct initial state.
  let favoriteSet = new Set<string>();
  if (viewerId && items.length > 0) {
    const rows = await db
      .select({
        favoriteId: userFavorites.favoriteId,
        favoriteType: userFavorites.favoriteType,
      })
      .from(userFavorites)
      .where(
        and(
          eq(userFavorites.userId, viewerId),
          inArray(
            userFavorites.favoriteId,
            items.map((i) => i.mediaId),
          ),
        ),
      );
    favoriteSet = new Set(
      rows.map((r) => `${r.favoriteType}:${r.favoriteId}`),
    );
  }

  const enriched = await enrichWatchlistItems(items, region, favoriteSet);
  return { watchlist, items: enriched, isOwner, owner };
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
) {
  const userId = await requireUserId();
  await addItem(watchlistId, userId, mediaType, mediaId);
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
    if (inserted !== null) added += 1;
    revalidatePath(`/watchlists/${watchlistId}`);
  }
  revalidatePath('/watchlists');
  return added;
}

/**
 * Discovery payload for the add-titles modal's "Similar" tab: TMDB
 * recommendations seeded from the titles already on this list, with those
 * same titles excluded so nothing suggested is a duplicate add. Derives the
 * seeds server-side from the watchlist (verifying the caller can access it)
 * rather than trusting a client-supplied list. Returns an empty array when the
 * list is empty — the modal renders its own "add a few titles first" state.
 */
export async function getWatchlistRecommendationsAction(
  watchlistId: string,
): Promise<RecommendationItem[]> {
  const userId = await requireUserId();
  const { items } = await getWatchlist(watchlistId, userId);
  if (items.length === 0) return [];

  const seeds = items.map((i) => ({
    mediaType: i.mediaType,
    mediaId: i.mediaId,
  }));
  const excludeKeys = new Set(items.map((i) => `${i.mediaType}:${i.mediaId}`));
  return getWatchlistRecommendations(seeds, excludeKeys);
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
) {
  const userId = await requireUserId();
  await reorderItems(watchlistId, userId, orderedIds);
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
