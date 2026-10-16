'use client';

import { useState, useTransition } from 'react';
import { QuickViewLink } from '@/components/watchly/QuickViewLink';
import Image from 'next/image';
import { Heart, Trash2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { buildImageUrl } from '@/lib/tmdb';
import { formatRuntime, formatYear, formatRelativeAgo } from '@/lib/format';
import { ProviderBadge } from '@/components/ui/ProviderBadge';
import { useToast } from '@/hooks/useToast';
import { toggleFavoriteAction } from '@/actions/favorites';
import {
  updateItemStatusAction,
  updateItemNotesAction,
} from '@/actions/watchlists';
import { StatusChip } from './StatusChip';
import { NotesEditor } from './NotesEditor';
import type { EnrichedWatchlistItem } from '@/services/watchlists/enrich';
import type { WatchlistItemStatus } from '@/services/watchlists';

interface WatchlistItemCardProps {
  item: EnrichedWatchlistItem;
  watchlistId: string;
  isOwner: boolean;
  onRemove: (mediaType: EnrichedWatchlistItem['type'], mediaId: string) => void;
  onStatusChange?: (itemId: string, status: WatchlistItemStatus) => void;
  onNotesChange?: (itemId: string, notes: string | null) => void;
}

function getName(item: EnrichedWatchlistItem): string {
  return item.type === 'movie' ? item.data.title : item.data.name;
}

function getYear(item: EnrichedWatchlistItem): string | null {
  const date =
    item.type === 'movie' ? item.data.releaseDate : item.data.firstAirDate;
  return formatYear(date);
}

export function WatchlistItemCard({
  item,
  watchlistId,
  isOwner,
  onRemove,
  onStatusChange,
  onNotesChange,
}: WatchlistItemCardProps) {
  const imageUrl = buildImageUrl(item.data.posterPath, 'w500');
  const name = getName(item);
  const year = getYear(item);
  const runtime = formatRuntime(item.runtime);
  const meta = [year, runtime].filter(Boolean).join('  •  ');

  const toast = useToast();
  const [isFavorite, setIsFavorite] = useState(item.isFavorite);
  const [status, setStatus] = useState<WatchlistItemStatus>(item.status);
  const [notes, setNotes] = useState<string | null>(item.notes);
  const [pending, startTransition] = useTransition();

  const handleStatusChange = (next: WatchlistItemStatus) => {
    const previous = status;
    setStatus(next); // optimistic
    onStatusChange?.(item.id, next);

    startTransition(async () => {
      try {
        await updateItemStatusAction(watchlistId, item.id, next);
      } catch {
        setStatus(previous);
        onStatusChange?.(item.id, previous);
        toast.error('Status update failed', 'Please try again.');
      }
    });
  };

  const handleNotesChange = async (nextNotes: string | null) => {
    const previous = notes;
    setNotes(nextNotes); // optimistic
    onNotesChange?.(item.id, nextNotes);
    try {
      await updateItemNotesAction(watchlistId, item.id, nextNotes);
    } catch {
      setNotes(previous);
      onNotesChange?.(item.id, previous);
      toast.error('Notes update failed', 'Please try again.');
      throw new Error('rollback');
    }
  };

  // "Watching since" / "Finished N ago" helper text under the status pill.
  // Uses ISO timestamps set server-side by updateItemStatus's transitions.
  const journeyLine = buildJourneyLine(status, item.startedAt, item.finishedAt);

  const handleToggleFavorite = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (pending) return;

    const previous = isFavorite;
    setIsFavorite(!previous);

    startTransition(async () => {
      try {
        await toggleFavoriteAction(String(item.data.id), item.type, previous);
        toast.success(
          previous ? 'Removed from favorites' : 'Added to favorites',
        );
      } catch {
        setIsFavorite(previous);
        toast.error('Action failed', 'Please try again.');
      }
    });
  };

  return (
    // `group` scopes hover state to the poster Link so the hover overlay
    // (Like / Remove) doesn't fight with the status chip in the footer.
    <div className="relative flex flex-col">
      <QuickViewLink
        mediaType={item.type}
        titleId={item.data.id}
        className="group relative aspect-2/3 w-full overflow-hidden rounded-lg bg-card shadow-elevation-card transition-transform duration-300 hover:scale-[1.02]"
      >
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={name}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 16vw"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-secondary/30">
            <span className="text-muted-foreground text-xs uppercase tracking-widest font-bold">
              No Image
            </span>
          </div>
        )}

        {/* Provider chip (top-right) */}
        {item.provider && (
          <div className="absolute top-2 right-2">
            <ProviderBadge
              providerId={item.provider.providerId}
              label={item.provider.providerName}
              size="sm"
            />
          </div>
        )}

        {/* Not ranked by the curator yet (see watchlist_items.ranked_at). */}
        {!item.rankedAt && (
          <span className="absolute bottom-2 left-2 rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground shadow-elevation-card">
            Recently Added
          </span>
        )}

        {/* Hover overlay with action buttons */}
        <div className="absolute inset-0 flex items-center justify-center gap-3 bg-black/55 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <button
            type="button"
            onClick={handleToggleFavorite}
            disabled={pending}
            className={cn(
              'flex flex-col items-center gap-1 text-xs text-white transition-colors cursor-pointer disabled:opacity-50',
              isFavorite ? 'text-primary' : 'hover:text-primary',
            )}
            aria-label={
              isFavorite ? 'Remove from favorites' : 'Add to favorites'
            }
          >
            <span className="h-10 w-10 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center">
              <Heart
                className={cn(
                  'w-5 h-5 transition-colors',
                  isFavorite && 'fill-primary text-primary',
                )}
              />
            </span>
            {isFavorite ? 'Liked' : 'Like'}
          </button>
          {isOwner && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onRemove(item.type, item.mediaId);
              }}
              className="flex flex-col items-center gap-1 text-xs text-white hover:text-destructive transition-colors cursor-pointer"
              aria-label="Remove from watchlist"
            >
              <span className="h-10 w-10 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center">
                <Trash2 className="w-5 h-5" />
              </span>
              Remove
            </button>
          )}
        </div>
      </QuickViewLink>

      <div className="flex flex-col gap-1.5 mt-3">
        <h3 className="text-sm font-medium leading-tight truncate text-foreground transition-colors">
          {name}
        </h3>
        {meta && (
          <span className="text-xs text-muted-foreground">{meta}</span>
        )}
        {/* Status pill — lives in the footer so its dropdown opens cleanly
            on the page background instead of fighting with the poster's
            hover overlay. Owners get a dropdown; non-owners get read-only. */}
        <div className="mt-1">
          <StatusChip
            status={status}
            onChange={isOwner ? handleStatusChange : undefined}
            menuPlacement="down"
          />
        </div>

        {journeyLine && (
          <span className="text-[11px] text-muted-foreground/80">
            {journeyLine}
          </span>
        )}

        <NotesEditor
          value={notes}
          isOwner={isOwner}
          onSubmit={handleNotesChange}
        />
      </div>
    </div>
  );
}

function buildJourneyLine(
  status: WatchlistItemStatus,
  startedAt: string | null,
  finishedAt: string | null,
): string | null {
  if (status === 'finished' && finishedAt) {
    return `Finished ${formatRelativeAgo(finishedAt)}`;
  }
  if (
    (status === 'watching' ||
      status === 'rewatch' ||
      status === 'paused' ||
      status === 'waiting_for_episode' ||
      status === 'waiting_for_season') &&
    startedAt
  ) {
    return `Started ${formatRelativeAgo(startedAt)}`;
  }
  return null;
}
