'use client';

import { useState, useTransition, type ReactNode } from 'react';
import { QuickViewLink } from '@/components/watchly/QuickViewLink';
import Image from 'next/image';
import { Trash2 } from 'lucide-react';
import { buildImageUrl } from '@/lib/tmdb';
import { formatRuntime, formatYear } from '@/lib/format';
import { ProviderBadge } from '@/components/ui/ProviderBadge';
import { NotInRegionPill } from '@/components/ui/NotInRegionPill';
import { useToast } from '@/hooks/useToast';
import {
  updateItemStatusAction,
  updateItemNotesAction,
} from '@/actions/watchlists';
import { StatusChip } from './StatusChip';
import { NotesEditor } from './NotesEditor';
import { RankEditor } from './RankEditor';
import type { EnrichedWatchlistItem } from '@/services/watchlists/enrich';
import type { WatchlistItemStatus } from '@/services/watchlists';

interface WatchlistListItemProps {
  item: EnrichedWatchlistItem;
  /**
   * Curator's rank: 1-based position among ranked items in the full list.
   * `null` = not ranked yet ("--" + "Recently Added" badge). Omitted in Auto
   * sort, where position isn't an editorial ranking.
   */
  rank?: number | null;
  /** Highest allowed rank (item count of the whole watchlist). */
  maxRank?: number;
  /** Owner-only: set rank by typing (0 = unrank). */
  onRankChange?: (rank: number) => void;
  /** Rendered at the start of the row (owner drag-to-rank). */
  dragHandle?: ReactNode;
  watchlistId: string;
  isOwner: boolean;
  onRemove: (mediaType: EnrichedWatchlistItem['type'], mediaId: string) => void;
  onStatusChange?: (itemId: string, status: WatchlistItemStatus) => void;
  onNotesChange?: (itemId: string, notes: string | null) => void;
}

function getMeta(item: EnrichedWatchlistItem): string {
  const year = formatYear(
    item.type === 'movie' ? item.data.releaseDate : item.data.firstAirDate,
  );
  const seasons = item.type === 'tv' ? item.data.number_of_seasons : 0;
  const length =
    item.type === 'tv'
      ? seasons
        ? `${seasons} season${seasons === 1 ? '' : 's'}`
        : null
      : formatRuntime(item.runtime);
  const genres = item.data.genres
    .slice(0, 2)
    .map((g) => g.name)
    .join(', ');
  return [year, length, genres].filter(Boolean).join(' · ');
}

/**
 * Ranked editorial row for the watchlist List view: position number, poster,
 * overview, curator notes, status. Status/notes save optimistically, same as
 * WatchlistItemCard. Renders the row content only — the caller supplies the
 * `<li>` (plain, animated, or sortable).
 */
export function WatchlistListItem({
  item,
  rank,
  maxRank = 0,
  onRankChange,
  dragHandle,
  watchlistId,
  isOwner,
  onRemove,
  onStatusChange,
  onNotesChange,
}: WatchlistListItemProps) {
  const name = item.type === 'movie' ? item.data.title : item.data.name;
  const posterUrl = buildImageUrl(item.data.posterPath, 'w185');
  const meta = getMeta(item);

  const toast = useToast();
  const [status, setStatus] = useState<WatchlistItemStatus>(item.status);
  const [notes, setNotes] = useState<string | null>(item.notes);
  const [, startTransition] = useTransition();

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

  return (
    <div className="group flex gap-4 sm:gap-5 py-6">
      {dragHandle}
      {rank !== undefined && (
        <RankEditor rank={rank} max={maxRank} onSubmit={onRankChange} />
      )}

      <QuickViewLink
        mediaType={item.type}
        titleId={item.data.id}
        className="relative h-30 w-20 sm:h-36 sm:w-24 shrink-0 overflow-hidden rounded-md bg-secondary/40"
      >
        {posterUrl && (
          <Image src={posterUrl} alt={name} fill className="object-cover" sizes="96px" />
        )}
      </QuickViewLink>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-start gap-3">
          <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3">
            <QuickViewLink mediaType={item.type} titleId={item.data.id} className="text-lg font-semibold hover:underline">
              {name}
            </QuickViewLink>
            {rank === null && (
              // Ranking badge, deliberately not a status pill: it says where
              // the title sits in the curator's ranking, not watch progress.
              <span className="self-center rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">
                Recently Added
              </span>
            )}
            {meta && <span className="text-sm text-muted-foreground">{meta}</span>}
          </div>
          {isOwner && (
            <button
              type="button"
              onClick={() => onRemove(item.type, item.mediaId)}
              aria-label={`Remove ${name} from watchlist`}
              className="shrink-0 p-1 rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-destructive transition-opacity cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>

        {item.data.overview && (
          <p className="line-clamp-2 max-w-3xl text-sm text-muted-foreground">
            {item.data.overview}
          </p>
        )}

        {isOwner ? (
          <div className="max-w-3xl">
            <NotesEditor value={notes} isOwner onSubmit={handleNotesChange} />
          </div>
        ) : (
          notes && (
            <blockquote className="max-w-3xl border-l-2 border-primary pl-3 text-sm italic text-foreground/90 whitespace-pre-line">
              {notes}
            </blockquote>
          )
        )}

        <div className="mt-1 flex items-center gap-3">
          <StatusChip
            status={status}
            onChange={isOwner ? handleStatusChange : undefined}
            menuPlacement="down"
          />
          {item.provider ? (
            <ProviderBadge
              providerId={item.provider.providerId}
              label={item.provider.providerName}
              size="sm"
            />
          ) : (
            item.availabilityChecked && <NotInRegionPill />
          )}
        </div>
      </div>
    </div>
  );
}
