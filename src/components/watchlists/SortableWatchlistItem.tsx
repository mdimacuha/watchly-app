'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { cn } from '@/lib/cn';
import { WatchlistItemCard } from './WatchlistItemCard';
import type { EnrichedWatchlistItem } from '@/services/watchlists/enrich';
import type { WatchlistItemStatus } from '@/services/watchlists';

interface SortableWatchlistItemProps {
  item: EnrichedWatchlistItem;
  watchlistId: string;
  isOwner: boolean;
  onRemove: (mediaType: EnrichedWatchlistItem['type'], mediaId: string) => void;
  onStatusChange?: (itemId: string, status: WatchlistItemStatus) => void;
  onNotesChange?: (itemId: string, notes: string | null) => void;
}

export function SortableWatchlistItem({
  item,
  watchlistId,
  isOwner,
  onRemove,
  onStatusChange,
  onNotesChange,
}: SortableWatchlistItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn('relative', isDragging && 'z-10 opacity-60')}
    >
      <WatchlistItemCard
        item={item}
        watchlistId={watchlistId}
        isOwner={isOwner}
        onRemove={onRemove}
        onStatusChange={onStatusChange}
        onNotesChange={onNotesChange}
      />

      {/* Drag handle — only listeners attach here, so clicks on the rest of
          the card still navigate via the underlying Link. */}
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
        className="absolute top-2 left-2 z-10 p-2 rounded-full bg-black/50 backdrop-blur-sm text-white opacity-70 hover:opacity-100 hover:bg-black/70 transition-opacity cursor-grab active:cursor-grabbing touch-none"
      >
        <GripVertical className="w-4 h-4" />
      </button>
    </div>
  );
}
