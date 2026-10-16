'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { QuickViewLink } from '@/components/watchly/QuickViewLink';
import Image from 'next/image';
import { cn } from '@/lib/cn';
import { buildImageUrl } from '@/lib/tmdb';
import { formatYear } from '@/lib/format';
import type { EnrichedWatchlistItem } from '@/services/watchlists/enrich';

interface WatchlistBoardCardProps {
  item: EnrichedWatchlistItem;
  isOwner: boolean;
}

/**
 * Compact card used inside board columns. No status chip (status = column),
 * no hover-overlay actions (board view is for triaging status, not for
 * remove / like). Clicking the card body opens Quick View;
 * dragging changes the column it lives in (i.e. status).
 */
export function WatchlistBoardCard({ item, isOwner }: WatchlistBoardCardProps) {
  const name = item.type === 'movie' ? item.data.title : item.data.name;
  const date =
    item.type === 'movie' ? item.data.releaseDate : item.data.firstAirDate;
  const year = formatYear(date);
  const imageUrl = buildImageUrl(item.data.posterPath, 'w342');

  // Sortable is owner-only — non-owners just see a static card.
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: item.id,
      data: { type: 'item', status: item.status },
      disabled: !isOwner,
    });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'rounded-md border border-border bg-card overflow-hidden transition-shadow',
        isDragging && 'opacity-50 ring-2 ring-primary z-10 shadow-lg',
        isOwner && 'cursor-grab active:cursor-grabbing touch-none',
      )}
      {...(isOwner ? { ...attributes, ...listeners } : {})}
    >
      <QuickViewLink
        mediaType={item.type}
        titleId={item.data.id}
        // No stopPropagation: dnd-kit's PointerSensor uses an
        // `activationConstraint: { distance: 4 }`, so a pure click (no
        // movement) goes through to the Link, and a movement past 4px starts
        // a drag. Stopping the event here would block drags initiated on the
        // Link body (anywhere but the top border).
        className="block group"
      >
        <div className="relative aspect-2/3 w-full bg-muted">
          {imageUrl ? (
            <Image
              src={imageUrl}
              alt={name}
              fill
              className="object-cover"
              sizes="240px"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <span className="text-muted-foreground text-[10px] uppercase tracking-widest font-bold">
                No Image
              </span>
            </div>
          )}
        </div>
        <div className="px-2.5 py-2 flex flex-col gap-0.5">
          <h4 className="text-xs font-medium leading-tight line-clamp-2 text-foreground group-hover:text-primary transition-colors">
            {name}
          </h4>
          {year && (
            <span className="text-[10px] text-muted-foreground">{year}</span>
          )}
          {item.notes && (
            <p className="text-[10px] text-muted-foreground/80 italic line-clamp-2 mt-1 whitespace-pre-line">
              {item.notes}
            </p>
          )}
        </div>
      </QuickViewLink>
    </div>
  );
}
