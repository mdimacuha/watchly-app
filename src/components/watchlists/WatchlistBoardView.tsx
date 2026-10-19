'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCorners,
  useDroppable,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { cn } from '@/lib/cn';
import { ArrowStrip } from '@/components/ui/ArrowStrip';
import { STATUS_META, STATUS_ORDER } from './StatusChip';
import { WatchlistBoardCard } from './WatchlistBoardCard';
import { useToast } from '@/hooks/useToast';
import { updateItemStatusAction } from '@/actions/watchlists';
import type { EnrichedWatchlistItem } from '@/services/watchlists/enrich';
import type { WatchlistItemStatus } from '@/services/watchlists';

interface WatchlistBoardViewProps {
  watchlistId: string;
  items: EnrichedWatchlistItem[];
  isOwner: boolean;
  /**
   * Notifies the parent of a confirmed (or rolled-back) status change. Used
   * by `WatchlistDetailClient` to keep its `items` state + filter counts in
   * sync with the board drag.
   */
  onStatusChange: (itemId: string, status: WatchlistItemStatus) => void;
}

/**
 * Kanban-style board for managing watchlist item status by drag-and-drop.
 * 9 horizontally-scrollable columns, one per status. Cross-column drop
 * triggers `updateItemStatusAction`.
 *
 * Reordering within a column is intentionally not persisted here — the grid
 * view's `sortOrder` is the canonical ordering. Within a board column we just
 * use createdAt-desc so cards land in a predictable spot when a status changes.
 */
export function WatchlistBoardView({
  watchlistId,
  items,
  isOwner,
  onStatusChange,
}: WatchlistBoardViewProps) {
  const toast = useToast();

  // Local column state mirrors items, indexed by status. Drag operations
  // optimistically move an item between columns; rollback restores from the
  // canonical `items` prop on failure.
  //
  // The "derived state with prev-props sentinel" pattern below is the React-
  // sanctioned way to re-sync local state with a parent prop without using
  // useEffect (avoids the cascade-render warning). Lint rule: react-hooks/
  // set-state-in-effect.
  const [columns, setColumns] = useState(() => groupByStatus(items));
  const [prevItems, setPrevItems] = useState(items);
  if (prevItems !== items) {
    setPrevItems(items);
    setColumns(groupByStatus(items));
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Track the active drag's id so we can render an overlay preview.
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeItem = activeId
    ? items.find((i) => i.id === activeId) ?? null
    : null;

  // The board lives inside an `overflow-x-auto` scroll container. dnd-kit's
  // DragOverlay is positioned relative to its scroll/transform ancestor, so
  // once the user scrolls to the rightmost columns the preview drifts off the
  // cursor. Portalling the overlay to <body> anchors it to the viewport and
  // keeps it under the cursor from every column.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const dragOverlay = (
    <DragOverlay>
      {activeItem ? (
        // Width matches the actual card render width: column is w-[240px]
        // with p-2 (8px each side) → cards are 224px. Mismatch here pushes
        // the overlay off-cursor.
        <div className="w-[224px] opacity-90 cursor-grabbing">
          <WatchlistBoardCard item={activeItem} isOwner={false} />
        </div>
      ) : null}
    </DragOverlay>
  );

  const handleDragOver = (event: DragOverEvent) => {
    if (!isOwner) return;
    const { active, over } = event;
    if (!over) return;

    const activeStatus = findItemStatus(columns, String(active.id));
    const overStatus = resolveOverStatus(over, columns);
    if (!activeStatus || !overStatus || activeStatus === overStatus) return;

    // Optimistically move the dragged item from its current column to the
    // hovered one so the preview reflects the destination. Persists on dragEnd.
    setColumns((prev) => {
      const next: typeof prev = { ...prev };
      const fromList = [...prev[activeStatus]];
      const idx = fromList.findIndex((i) => i.id === active.id);
      if (idx === -1) return prev;
      const [moved] = fromList.splice(idx, 1);
      next[activeStatus] = fromList;
      next[overStatus] = [{ ...moved, status: overStatus }, ...prev[overStatus]];
      return next;
    });
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveId(null);
    if (!isOwner) return;

    const { active, over } = event;
    if (!over) return;

    // Where did it end up after handleDragOver's optimistic moves?
    const finalStatus = findItemStatus(columns, String(active.id));
    const originalStatus = items.find((i) => i.id === active.id)?.status;
    if (!finalStatus || !originalStatus || finalStatus === originalStatus) {
      // No column change — nothing to persist.
      return;
    }

    try {
      await updateItemStatusAction(
        watchlistId,
        String(active.id),
        finalStatus,
      );
      onStatusChange(String(active.id), finalStatus);
    } catch {
      setColumns(groupByStatus(items)); // rollback to canonical state
      toast.error('Status update failed', 'Please try again.');
    }
  };

  return (
    <ArrowStrip label="status columns">
    <div className="overflow-x-auto scrollbar-thin pb-3 -mx-4 px-4">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={(e) => setActiveId(String(e.active.id))}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={() => {
          setActiveId(null);
          setColumns(groupByStatus(items));
        }}
      >
        {(() => {
          // Hide empty columns by default — keeps the board focused on the
          // statuses actually in use. During a drag, surface all 9 columns so
          // the user can drop into any status (empty ones dimmed for context).
          const isDragging = activeId !== null;
          const visibleStatuses = isDragging
            ? STATUS_ORDER
            : STATUS_ORDER.filter((s) => columns[s].length > 0);

          return (
            <div className="flex gap-3 min-w-max">
              {visibleStatuses.map((status) => (
                <BoardColumn
                  key={status}
                  status={status}
                  items={columns[status]}
                  isOwner={isOwner}
                  // Dim empty columns during a drag so the active ones still
                  // read as the visual anchor.
                  dimmed={isDragging && columns[status].length === 0}
                />
              ))}
            </div>
          );
        })()}

        {mounted ? createPortal(dragOverlay, document.body) : dragOverlay}
      </DndContext>
    </div>
    </ArrowStrip>
  );
}

interface BoardColumnProps {
  status: WatchlistItemStatus;
  items: EnrichedWatchlistItem[];
  isOwner: boolean;
  /** True when the column is empty AND a drag is in progress — dim it. */
  dimmed?: boolean;
}

function BoardColumn({ status, items, isOwner, dimmed }: BoardColumnProps) {
  const meta = STATUS_META[status];

  // Droppable wrapper so empty columns can still accept a drop. dnd-kit
  // matches `over.id` to the column id when no item is under the cursor.
  const { setNodeRef, isOver } = useDroppable({
    id: `col:${status}`,
    data: { type: 'column', status },
    disabled: !isOwner,
  });

  return (
    <div
      className={cn(
        'flex flex-col w-[240px] shrink-0 transition-opacity',
        // Full opacity when hovered (so the drop target highlights even when
        // it was dimmed) — otherwise muted while a drag is going through.
        dimmed && !isOver && 'opacity-40',
      )}
    >
      <div className="flex items-center gap-2 mb-2 px-1">
        <span className={cn('w-2 h-2 rounded-full', meta.dotClass)} />
        <h4 className="text-[11px] uppercase tracking-wider font-semibold text-foreground">
          {meta.label}
        </h4>
        <span className="text-[10px] tabular-nums px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
          {items.length}
        </span>
      </div>

      <SortableContext
        id={`col:${status}`}
        items={items.map((i) => i.id)}
        strategy={verticalListSortingStrategy}
      >
        <div
          ref={setNodeRef}
          className={cn(
            'flex flex-col gap-2 p-2 rounded-lg bg-muted/20 min-h-[100px] transition-colors',
            isOver && isOwner && 'bg-primary/5 ring-1 ring-primary/40',
          )}
        >
          {items.map((item) => (
            <WatchlistBoardCard
              key={item.id}
              item={item}
              isOwner={isOwner}
            />
          ))}
          {items.length === 0 && (
            <div className="text-center text-[11px] text-muted-foreground/50 py-6">
              Drop here
            </div>
          )}
        </div>
      </SortableContext>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ColumnMap = Record<WatchlistItemStatus, EnrichedWatchlistItem[]>;

function groupByStatus(items: EnrichedWatchlistItem[]): ColumnMap {
  const acc: ColumnMap = {
    just_added: [],
    up_next: [],
    watching: [],
    waiting_for_episode: [],
    waiting_for_season: [],
    paused: [],
    finished: [],
    rewatch: [],
    dropped: [],
  };
  for (const i of items) acc[i.status].push(i);
  // Within a column, newest-first feels right when statuses change mid-session.
  for (const k of Object.keys(acc) as WatchlistItemStatus[]) {
    acc[k].sort((a, b) => b.addedAt.localeCompare(a.addedAt));
  }
  return acc;
}

function findItemStatus(
  columns: ColumnMap,
  itemId: string,
): WatchlistItemStatus | null {
  for (const key of Object.keys(columns) as WatchlistItemStatus[]) {
    if (columns[key].some((i) => i.id === itemId)) return key;
  }
  return null;
}

interface DndOver {
  id: string | number;
  data: { current?: { type?: string; status?: WatchlistItemStatus } };
}

/**
 * `over` can be either an item card (id = item.id) or the column droppable
 * (id = "col:<status>"). Resolve to a status either way.
 */
function resolveOverStatus(
  over: DndOver,
  columns: ColumnMap,
): WatchlistItemStatus | null {
  const overId = String(over.id);
  if (overId.startsWith('col:')) {
    return overId.slice('col:'.length) as WatchlistItemStatus;
  }
  // Otherwise the cursor is over an item — find which column it lives in.
  return findItemStatus(columns, overId);
}
