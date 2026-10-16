'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { cn } from '@/lib/cn';
import { WatchlistListItem } from './WatchlistListItem';
import type { EnrichedWatchlistItem } from '@/services/watchlists/enrich';
import type { WatchlistItemStatus } from '@/services/watchlists';

interface SortableWatchlistListItemProps {
  item: EnrichedWatchlistItem;
  /** null = not ranked yet ("Recently Added"). */
  rank: number | null;
  maxRank: number;
  onRankChange: (rank: number) => void;
  watchlistId: string;
  isOwner: boolean;
  onRemove: (mediaType: EnrichedWatchlistItem['type'], mediaId: string) => void;
  onStatusChange?: (itemId: string, status: WatchlistItemStatus) => void;
  onNotesChange?: (itemId: string, notes: string | null) => void;
}

/** List-view row the curator can drag (or arrow-key) to change its rank. */
export function SortableWatchlistListItem(props: SortableWatchlistListItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: props.item.id });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'relative bg-background border-b border-border last:border-b-0',
        isDragging && 'z-10 opacity-60',
      )}
    >
      <WatchlistListItem
        {...props}
        dragHandle={
          // Only the handle gets listeners, so links/status/notes in the row
          // keep working normally.
          <button
            type="button"
            {...attributes}
            {...listeners}
            aria-label={
              props.rank === null
                ? 'Drag to rank, currently unranked'
                : `Drag to rank, currently #${props.rank}`
            }
            className="-ml-2 self-start p-1 rounded-md text-muted-foreground/60 hover:text-foreground cursor-grab active:cursor-grabbing touch-none"
          >
            <GripVertical className="w-4 h-4" />
          </button>
        }
      />
    </li>
  );
}
