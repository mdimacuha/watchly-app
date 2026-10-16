import { z } from 'zod';
import { loadTitle, type InsightTitle } from '@/services/profile/insights';
import { getWatchlist, type WatchlistItemStatus, type WatchlistOwner } from './index';

/** Titles fetched for the preview — the first few in the list's own order. */
const PREVIEW_LIMIT = 12;

export interface WatchlistQuickLookItem extends InsightTitle {
  itemId: string;
  status: WatchlistItemStatus;
  /** Curator rank (1-based among ranked items); null = "Recently Added". */
  rank: number | null;
}

export interface WatchlistQuickLook {
  id: string;
  name: string;
  description: string;
  isPublic: boolean;
  isOwner: boolean;
  updatedAt: string;
  total: number;
  owner: WatchlistOwner;
  statusCounts: Partial<Record<WatchlistItemStatus, number>>;
  items: WatchlistQuickLookItem[];
}

const idSchema = z.string().uuid();

/**
 * Lightweight watchlist preview for Quick View: list meta, a status
 * breakdown, and the first titles in the order a visitor sees on the list
 * page. Visibility is enforced by getWatchlist (owner or public only).
 * Skips the full page's per-item provider enrichment to stay fast.
 */
export async function getWatchlistQuickLook(watchlistId: string, viewerId: string | null): Promise<WatchlistQuickLook> {
  const id = idSchema.parse(watchlistId);
  const { watchlist, items, isOwner, owner } = await getWatchlist(id, viewerId);

  const rankById = new Map(items.filter((i) => i.rankedAt).map((i, idx) => [i.id, idx + 1]));
  const statusCounts: Partial<Record<WatchlistItemStatus, number>> = {};
  for (const item of items) statusCounts[item.status] = (statusCounts[item.status] ?? 0) + 1;

  const preview = items.slice(0, PREVIEW_LIMIT);
  const titles = await Promise.all(preview.map((i) => loadTitle(i.mediaType, i.mediaId)));

  return {
    id: watchlist.id,
    name: watchlist.name,
    description: watchlist.description,
    isPublic: watchlist.isPublic,
    isOwner,
    updatedAt: watchlist.updatedAt.toISOString(),
    total: items.length,
    owner,
    statusCounts,
    items: preview.flatMap((item, i) => {
      const t = titles[i];
      return t ? [{ ...t, itemId: item.id, status: item.status, rank: rankById.get(item.id) ?? null }] : [];
    }),
  };
}
