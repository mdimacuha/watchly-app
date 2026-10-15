'use client';

import { useState, useTransition } from 'react';
import Image from 'next/image';
import { History, Heart, Bookmark, X, Info, ListPlus } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import { buildImageUrl } from '@/lib/tmdb';
import { formatDate } from '@/lib/format';
import { useToast } from '@/hooks/useToast';
import { useUIStore } from '@/client/stores/ui';
import { FilterBar } from '@/components/watchly/FilterBar';
import { EmptyState } from '@/components/watchly/EmptyState';
import { PosterGridSkeleton } from '@/components/watchly/skeletons';
import { AddToWatchlistPicker } from '@/components/watchlists/AddToWatchlistPicker';
import { getSwipeHistoryAction } from '@/actions/swipe';
import type { SwipeAction, SwipeHistoryItem } from '@/services/swipe';

interface SwipeHistoryClientProps {
  initialItems: SwipeHistoryItem[];
}

type FilterId = 'all' | SwipeAction;

const FILTERS: { id: FilterId; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'liked', label: 'Liked' },
  { id: 'saved', label: 'Saved' },
  { id: 'passed', label: 'Passed' },
  { id: 'opened', label: 'Opened' },
];

const ACTION_META: Record<
  SwipeAction,
  { label: string; icon: LucideIcon; className: string }
> = {
  liked: { label: 'Liked', icon: Heart, className: 'bg-primary/15 text-primary' },
  saved: {
    label: 'Saved',
    icon: Bookmark,
    className: 'bg-primary/15 text-primary',
  },
  passed: {
    label: 'Passed',
    icon: X,
    className: 'bg-destructive/15 text-destructive',
  },
  opened: {
    label: 'Opened',
    icon: Info,
    className: 'bg-secondary text-muted-foreground',
  },
};

const HISTORY_PAGE_LIMIT = 24;

/**
 * Renders the swipe-history grid with per-action filtering. Each card opens
 * Quick View (via the shared UI store) or the add-to-watchlist picker. The
 * server passes the first page; changing the filter refetches through the
 * server action.
 */
export function SwipeHistoryClient({ initialItems }: SwipeHistoryClientProps) {
  const [items, setItems] = useState<SwipeHistoryItem[]>(initialItems);
  const [filter, setFilter] = useState<FilterId>('all');
  const [isPending, startTransition] = useTransition();
  const [pickerTarget, setPickerTarget] = useState<{
    mediaType: 'movie' | 'tv';
    mediaId: string;
  } | null>(null);
  const toast = useToast();
  const openQuickView = useUIStore((s) => s.openQuickView);

  const handleFilter = (id: string) => {
    const nextFilter = id as FilterId;
    if (nextFilter === filter) return;
    setFilter(nextFilter);
    startTransition(async () => {
      try {
        const res = await getSwipeHistoryAction({
          limit: HISTORY_PAGE_LIMIT,
          action: nextFilter === 'all' ? undefined : nextFilter,
        });
        setItems(res.items);
      } catch (err) {
        toast.error(
          'Could not load history',
          err instanceof Error ? err.message : 'Please try again.',
        );
      }
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <FilterBar
        filters={FILTERS}
        activeFilterId={filter}
        onSelect={handleFilter}
      />

      {isPending ? (
        <PosterGridSkeleton count={12} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={History}
          title={filter === 'all' ? 'No swipes yet' : 'Nothing here'}
          description={
            filter === 'all'
              ? 'Head to WatchlySwipe and start swiping — the titles you react to will show up here.'
              : 'You haven’t swiped any titles that match this filter yet.'
          }
        />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {items.map((item) => (
            <HistoryCard
              key={item.swipeId}
              item={item}
              onQuickView={() => openQuickView(item.mediaType, item.mediaId)}
              onAddToWatchlist={() =>
                setPickerTarget({
                  mediaType: item.mediaType,
                  mediaId: item.mediaId,
                })
              }
            />
          ))}
        </div>
      )}

      {pickerTarget && (
        <AddToWatchlistPicker
          isOpen
          onClose={() => setPickerTarget(null)}
          mediaType={pickerTarget.mediaType}
          mediaId={pickerTarget.mediaId}
        />
      )}
    </div>
  );
}

function HistoryCard({
  item,
  onQuickView,
  onAddToWatchlist,
}: {
  item: SwipeHistoryItem;
  onQuickView: () => void;
  onAddToWatchlist: () => void;
}) {
  const poster = buildImageUrl(item.posterPath, 'w342');
  // Fallback guards against a future open-ended action value (the DB column
  // is text, e.g. a later 'snoozed') reaching the UI before it's mapped.
  const meta = ACTION_META[item.action] ?? ACTION_META.opened;
  const ActionIcon = meta.icon;
  const displayTitle = item.title || 'Untitled';
  const swipedOn = formatDate(item.swipedAt);

  return (
    <div className="group flex flex-col gap-2">
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-lg bg-card shadow-elevation-card">
        <button
          type="button"
          onClick={onQuickView}
          aria-label={`Quick view ${displayTitle}`}
          className="absolute inset-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
        >
          {poster ? (
            <Image
              src={poster}
              alt={displayTitle}
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 200px"
              className="object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-secondary/40">
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                No poster
              </span>
            </div>
          )}
        </button>

        {/* Media-type badge — sits above the poster button (later in DOM). */}
        <span className="pointer-events-none absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white backdrop-blur-sm">
          {item.mediaType === 'movie' ? 'Movie' : 'TV'}
        </span>

        {/* Add-to-watchlist — always visible on touch, hover-reveal on desktop. */}
        <button
          type="button"
          onClick={onAddToWatchlist}
          aria-label={`Add ${displayTitle} to a watchlist`}
          title="Add to watchlist"
          className="absolute right-2 top-2 rounded-full bg-black/50 p-2 text-white backdrop-blur-sm transition-all duration-200 hover:bg-black/70 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:opacity-0 sm:group-hover:opacity-100"
        >
          <ListPlus className="h-4 w-4" />
        </button>
      </div>

      <div className="flex min-w-0 flex-col gap-1">
        <h3 className="truncate text-sm font-medium leading-tight text-foreground">
          {displayTitle}
        </h3>
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-medium',
              meta.className,
            )}
          >
            <ActionIcon className="h-3 w-3" strokeWidth={2.5} />
            {meta.label}
          </span>
          {item.year && (
            <>
              <span aria-hidden className="text-muted-foreground/40">
                ·
              </span>
              <span>{item.year}</span>
            </>
          )}
          {swipedOn && (
            <>
              <span aria-hidden className="text-muted-foreground/40">
                ·
              </span>
              <span>{swipedOn}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
