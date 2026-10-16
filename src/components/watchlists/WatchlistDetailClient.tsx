'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import {
  ArrowBigUp,
  ArrowDownUp,
  ListOrdered,
  Bookmark,
  Globe,
  LayoutGrid,
  LayoutPanelTop,
  List,
  Lock,
  Pencil,
  Plus,
  Share2,
  Trash2,
} from 'lucide-react';
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { BackLink } from '@/components/nav/BackLink';
import { UserAvatar } from '@/components/ui/user-avatar';
import { ConfirmDestructiveModal } from '@/components/ui/ConfirmDestructiveModal';
import { EmptyState } from '@/components/watchly/EmptyState';
import { useToast } from '@/hooks/useToast';
import { shareWatchlist } from '@/lib/share';
import {
  deleteWatchlistAction,
  getEnrichedWatchlistAction,
  getWatchlistVoteStateAction,
  removeFromWatchlistAction,
  reorderWatchlistItemsAction,
  setWatchlistItemRankAction,
  toggleWatchlistUpvoteAction,
  updateWatchlistAction,
} from '@/actions/watchlists';
import { FEATURES } from '@/constants/features';
import type {
  Watchlist,
  WatchlistOwner,
  WatchlistItemStatus,
} from '@/services/watchlists';
import type { EnrichedWatchlistItem } from '@/services/watchlists/enrich';
import { formatRelativeAgo } from '@/lib/format';
import { WatchlistItemCard } from './WatchlistItemCard';
import { SortableWatchlistItem } from './SortableWatchlistItem';
import { WatchlistFormModal } from './WatchlistFormModal';
import { AddTitlesModal } from './AddTitlesModal';
import { StatusFilterBar, type StatusFilter } from './StatusFilterBar';
import { WatchlistBoardView } from './WatchlistBoardView';
import { WatchlistListItem } from './WatchlistListItem';
import { SortableWatchlistListItem } from './SortableWatchlistListItem';
import { STATUS_PRIORITY } from './StatusChip';
import { cn } from '@/lib/cn';
import { placeAtRank } from '@/lib/ranking';

type ViewMode = 'grid' | 'list' | 'board';
function isViewMode(v: string | null): v is ViewMode {
  return v === 'grid' || v === 'list' || v === 'board';
}

type ListSort = 'rank' | 'auto';
function isListSort(v: string | null): v is ListSort {
  return v === 'rank' || v === 'auto';
}

const VALID_FILTERS: readonly StatusFilter[] = [
  'all',
  'just_added',
  'up_next',
  'watching',
  'waiting_for_episode',
  'waiting_for_season',
  'paused',
  'finished',
  'rewatch',
  'dropped',
] as const;

function isStatusFilter(v: string | null): v is StatusFilter {
  return v !== null && (VALID_FILTERS as readonly string[]).includes(v);
}

interface WatchlistDetailClientProps {
  watchlist: Watchlist;
  items: EnrichedWatchlistItem[];
  isOwner: boolean;
  owner: WatchlistOwner;
}

export function WatchlistDetailClient({
  watchlist: initialWatchlist,
  items: initialItems,
  isOwner,
  owner,
}: WatchlistDetailClientProps) {
  const [watchlist, setWatchlist] = useState(initialWatchlist);
  const [items, setItems] = useState(initialItems);
  const [isEditOpen, setEditOpen] = useState(false);
  const [isAddOpen, setAddOpen] = useState(false);
  // Set while the add-titles modal is open and at least one title was added,
  // so we refresh the (enriched) grid exactly once — on close — instead of
  // re-enriching the whole list after every individual add.
  const addedDuringSession = useRef(false);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const toast = useToast();

  // Filter state lives in the URL so it survives refresh + is shareable.
  const rawFilter = searchParams.get('status');
  const statusFilter: StatusFilter = isStatusFilter(rawFilter) ? rawFilter : 'all';

  const setStatusFilter = (next: StatusFilter) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === 'all') params.delete('status');
    else params.set('status', next);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  // View mode also URL-persisted — same rationale (shareable, refresh-safe).
  const rawView = searchParams.get('view');
  const viewMode: ViewMode = isViewMode(rawView) ? rawView : 'grid';

  const setViewMode = (next: ViewMode) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === 'grid') params.delete('view');
    else params.set('view', next);
    if (next !== 'list') params.delete('sort');
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  // Counts are always over the full list — that way "Watching (3)" doesn't
  // change as you toggle filters.
  const counts = useMemo(() => {
    const acc: Record<WatchlistItemStatus, number> = {
      just_added: 0,
      up_next: 0,
      watching: 0,
      waiting_for_episode: 0,
      waiting_for_season: 0,
      paused: 0,
      finished: 0,
      rewatch: 0,
      dropped: 0,
    };
    for (const i of items) acc[i.status]++;
    return acc;
  }, [items]);

  const filteredItems = useMemo(
    () =>
      statusFilter === 'all'
        ? items
        : items.filter((i) => i.status === statusFilter),
    [items, statusFilter],
  );

  // List sort (owner-only control): "rank" = curator's order (sortOrder),
  // "auto" = Watchly's auto sort by status priority. Viewers always get rank.
  const rawSort = searchParams.get('sort');
  const listSort: ListSort = isOwner && isListSort(rawSort) ? rawSort : 'rank';

  const setListSort = (next: ListSort) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === 'rank') params.delete('sort');
    else params.set('sort', next);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  // Auto keeps the curated order within each status (Array.sort is stable).
  // Display-only — sortOrder is untouched.
  const listItems = useMemo(
    () =>
      listSort === 'auto'
        ? [...filteredItems].sort(
            (a, b) => STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status],
          )
        : filteredItems,
    [filteredItems, listSort],
  );

  // Rank = position among ranked items in the full curated list, so a
  // filtered view still shows each title's real rank (e.g. #2, #7).
  // Unranked ("Recently Added") items have no rank → null.
  const rankById = useMemo(
    () =>
      new Map(
        items
          .filter((item) => item.rankedAt)
          .map((item, index) => [item.id, index + 1]),
      ),
    [items],
  );

  // `${type}:${mediaId}` keys the add-titles modal uses to mark results that
  // are already on this list as "Added" so they can't be duplicated.
  const existingKeys = useMemo(
    () => new Set(items.map((i) => `${i.type}:${i.mediaId}`)),
    [items],
  );

  // Pull the freshly-enriched list after titles are added in the modal. We
  // seed `items` from props once (useState), so a plain router.refresh()
  // wouldn't update the grid — re-fetch and set explicitly instead.
  const refreshItems = async () => {
    try {
      const { items: fresh } = await getEnrichedWatchlistAction(watchlist.id);
      setItems(fresh);
    } catch {
      toast.error('Could not refresh', 'Reload the page to see the latest.');
    }
  };

  const handleAddModalClose = () => {
    setAddOpen(false);
    if (addedDuringSession.current) {
      addedDuringSession.current = false;
      void refreshItems();
    }
  };

  // Cards manage status optimistically; mirror the change here so filter
  // counts + active-filter view stay in sync without a refetch.
  const handleStatusChange = (itemId: string, status: WatchlistItemStatus) => {
    setItems((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, status } : i)),
    );
  };

  const handleNotesChange = (itemId: string, notes: string | null) => {
    setItems((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, notes } : i)),
    );
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // @dnd-kit generates `aria-describedby` IDs from a global counter that
  // diverges between server and client on first paint. Render the DnD tree
  // only after mount to avoid the resulting hydration mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // Classic "did-mount" flag — the lint rule treats sync setState in
    // effects as a smell, but flipping a one-shot mount boolean is the
    // canonical way to defer client-only rendering past hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const previous = items;
    const moved = items[oldIndex];
    // Dragging a "Recently Added" item places it into the ranking.
    const rankedItemId = moved.rankedAt ? undefined : moved.id;
    const rankedAt = new Date().toISOString();
    const moveResult = arrayMove(items, oldIndex, newIndex).map((i) =>
      i.id === rankedItemId ? { ...i, rankedAt } : i,
    );
    // Unranked items stay pinned on top (matches the server's ordering), so a
    // ranked item dropped among them lands at the top of the ranking.
    const reordered = [
      ...moveResult.filter((i) => !i.rankedAt),
      ...moveResult.filter((i) => i.rankedAt),
    ];
    setItems(reordered);

    try {
      await reorderWatchlistItemsAction(
        watchlist.id,
        reordered.map((i) => i.id),
        rankedItemId,
      );
    } catch {
      setItems(previous);
      toast.error('Could not save order', 'Please try again.');
    }
  };

  // Typed rank from the List view: 0 = unrank, 1..n = position. Optimistic,
  // using the same placement rule the server applies.
  const handleRankChange = async (itemId: string, rank: number) => {
    const previous = items;
    const rankedAt = new Date().toISOString();
    const placed = placeAtRank(items, itemId, rank, (i) => i.rankedAt !== null);
    setItems(
      placed.map((i) =>
        i.id === itemId
          ? { ...i, rankedAt: rank === 0 ? null : (i.rankedAt ?? rankedAt) }
          : i,
      ),
    );
    try {
      await setWatchlistItemRankAction(watchlist.id, itemId, rank);
    } catch {
      setItems(previous);
      toast.error('Could not update rank', 'Please try again.');
    }
  };

  const handleEdit = async (values: {
    name: string;
    description: string;
    isPublic: boolean;
  }) => {
    const updated = await updateWatchlistAction(watchlist.id, values);
    setWatchlist(updated);
    toast.success('Watchlist updated');
  };

  // Destructive-confirm modal state. `null` = closed.
  const [isDeleteOpen, setDeleteOpen] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState<{
    mediaType: EnrichedWatchlistItem['type'];
    mediaId: string;
    title: string;
  } | null>(null);

  const confirmDeleteWatchlist = async () => {
    await deleteWatchlistAction(watchlist.id);
    toast.success('Watchlist deleted');
    router.push('/watchlists');
  };

  // Called by item cards to request removal — opens the confirm modal first.
  const requestRemoveItem = (
    mediaType: EnrichedWatchlistItem['type'],
    mediaId: string,
  ) => {
    const target = items.find(
      (i) => i.type === mediaType && i.mediaId === mediaId,
    );
    const title =
      target?.type === 'movie'
        ? target.data.title
        : target?.type === 'tv'
          ? target.data.name
          : 'this item';
    setPendingRemoval({ mediaType, mediaId, title });
  };

  const confirmRemoveItem = async () => {
    if (!pendingRemoval) return;
    const { mediaType, mediaId } = pendingRemoval;
    const previous = items;
    setItems((prev) =>
      prev.filter((i) => !(i.type === mediaType && i.mediaId === mediaId)),
    );
    try {
      await removeFromWatchlistAction(watchlist.id, mediaType, mediaId);
      toast.success('Removed');
    } catch (err) {
      setItems(previous);
      throw err; // surfaces in ConfirmDestructiveModal's toast
    }
  };

  const ownerName =
    owner.displayName ||
    `${owner.firstName} ${owner.lastName}`.trim() ||
    owner.username;

  return (
    <div className="flex flex-col gap-8">
      {/* Back link */}
      <BackLink fallbackHref="/watchlists" label="Back to Watchlists" />

      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex flex-col gap-3 min-w-0">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
            {watchlist.name}
          </h1>
          {watchlist.description && (
            <p className="text-muted-foreground text-base max-w-2xl whitespace-pre-line">
              {watchlist.description}
            </p>
          )}

          {/* Meta row: curator + count + updated + visibility */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
            <Link
              href={`/user/${owner.username}`}
              className="flex items-center gap-2 hover:text-foreground transition-colors"
            >
              <UserAvatar
                avatarUrl={owner.avatarUrl}
                firstName={owner.firstName}
                lastName={owner.lastName}
                size="sm"
              />
              <span>
                Curated by{' '}
                <span className="text-foreground font-medium">{ownerName}</span>
              </span>
            </Link>
            <span className="text-muted-foreground/40">•</span>
            <span>
              {items.length} {items.length === 1 ? 'title' : 'titles'}
            </span>
            <span className="text-muted-foreground/40">•</span>
            <span>Updated {formatRelativeAgo(watchlist.updatedAt)}</span>
            <span className="text-muted-foreground/40">•</span>
            <span className="flex items-center gap-1">
              {watchlist.isPublic ? (
                <>
                  <Globe className="w-3.5 h-3.5" /> Public
                </>
              ) : (
                <>
                  <Lock className="w-3.5 h-3.5" /> Private
                </>
              )}
            </span>
          </div>
        </div>

        {/* Actions */}
        {/* Wraps on phones: the owner's five buttons (~470px) used to widen
            the whole page, which pushed every fixed popup off-screen. */}
        <div className="flex flex-wrap items-center gap-2 lg:shrink-0">
          {FEATURES.watchlistUpvoting && watchlist.isPublic && (
            <WatchlistUpvoteButton watchlistId={watchlist.id} />
          )}
          {watchlist.isPublic && (
            <Button
              variant="outline"
              onClick={() => shareWatchlist(watchlist.id, watchlist.name)}
              className="gap-2"
            >
              <Share2 className="w-4 h-4" />
              Share
            </Button>
          )}
          {isOwner && (
            <>
              <Button onClick={() => setAddOpen(true)} className="gap-2">
                <Plus className="w-4 h-4" />
                Add titles
              </Button>
              <Button
                variant="outline"
                onClick={() => setEditOpen(true)}
                className="gap-2"
              >
                <Pencil className="w-4 h-4" />
                Edit List
              </Button>
              <Button
                variant="outline"
                onClick={() => setDeleteOpen(true)}
                className="gap-2 text-destructive hover:text-destructive"
                aria-label="Delete watchlist"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </>
          )}
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={Bookmark}
          title="No items yet"
          description={
            isOwner
              ? 'Search for titles or discover similar ones to build this list.'
              : 'This watchlist is empty.'
          }
          action={
            isOwner ? (
              <Button onClick={() => setAddOpen(true)} className="gap-2">
                <Plus className="w-4 h-4" />
                Add titles
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          {/* Filter bar (grid-mode only — board already shows all columns)
              and view toggle live on the same row. */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            {viewMode !== 'board' ? (
              <StatusFilterBar
                active={statusFilter}
                counts={counts}
                totalCount={items.length}
                onChange={setStatusFilter}
              />
            ) : (
              <span className="text-xs text-muted-foreground">
                Drag cards between columns to change status.
              </span>
            )}
            <div className="flex flex-wrap items-center gap-2">
              {viewMode === 'list' && isOwner && (
                <ListSortToggle listSort={listSort} onChange={setListSort} />
              )}
              <ViewToggle viewMode={viewMode} onChange={setViewMode} />
            </div>
          </div>

          {viewMode === 'board' ? (
            <WatchlistBoardView
              watchlistId={watchlist.id}
              items={items}
              isOwner={isOwner}
              onStatusChange={handleStatusChange}
            />
          ) : filteredItems.length === 0 ? (
            <EmptyState
              icon={Bookmark}
              title="Nothing here yet"
              description="No titles match this filter. Try a different status."
            />
          ) : viewMode === 'list' &&
            listSort === 'rank' &&
            isOwner &&
            mounted &&
            statusFilter === 'all' ? (
            // Drag-to-rank: same rules as the grid (owner, unfiltered) and
            // the same handleDragEnd → reorderWatchlistItemsAction.
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={listItems.map((i) => i.id)}
                strategy={verticalListSortingStrategy}
              >
                <ol className="flex flex-col">
                  {listItems.map((item) => (
                    <SortableWatchlistListItem
                      key={item.id}
                      item={item}
                      rank={rankById.get(item.id) ?? null}
                      maxRank={items.length}
                      onRankChange={(rank) => handleRankChange(item.id, rank)}
                      watchlistId={watchlist.id}
                      isOwner={isOwner}
                      onRemove={requestRemoveItem}
                      onStatusChange={handleStatusChange}
                      onNotesChange={handleNotesChange}
                    />
                  ))}
                </ol>
              </SortableContext>
            </DndContext>
          ) : viewMode === 'list' ? (
            <ol className="flex flex-col">
              {listItems.map((item) => (
                // `layout` animates rows to their new spot when a status
                // change re-sorts the Auto list, so the user can follow it.
                <motion.li
                  key={item.id}
                  layout="position"
                  transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                  className="border-b border-border last:border-b-0"
                >
                  <WatchlistListItem
                    item={item}
                    rank={listSort === 'rank' ? (rankById.get(item.id) ?? null) : undefined}
                    maxRank={items.length}
                    onRankChange={
                      isOwner
                        ? (rank) => handleRankChange(item.id, rank)
                        : undefined
                    }
                    watchlistId={watchlist.id}
                    isOwner={isOwner}
                    onRemove={requestRemoveItem}
                    onStatusChange={handleStatusChange}
                    onNotesChange={handleNotesChange}
                  />
                </motion.li>
              ))}
            </ol>
          ) : isOwner && mounted && statusFilter === 'all' ? (
            // DnD is only enabled in the unfiltered view — reordering a
            // filtered subset against an unfiltered sortOrder array would
            // produce surprising results.
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={filteredItems.map((i) => i.id)}
                strategy={rectSortingStrategy}
              >
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
                  {filteredItems.map((item) => (
                    <SortableWatchlistItem
                      key={item.id}
                      item={item}
                      watchlistId={watchlist.id}
                      isOwner={isOwner}
                      onRemove={requestRemoveItem}
                      onStatusChange={handleStatusChange}
                      onNotesChange={handleNotesChange}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
              {filteredItems.map((item) => (
                <WatchlistItemCard
                  key={item.id}
                  item={item}
                  watchlistId={watchlist.id}
                  isOwner={isOwner}
                  onRemove={requestRemoveItem}
                  onStatusChange={handleStatusChange}
                  onNotesChange={handleNotesChange}
                />
              ))}
            </div>
          )}
        </>
      )}

      {isOwner && (
        <>
          <AddTitlesModal
            isOpen={isAddOpen}
            onClose={handleAddModalClose}
            watchlistId={watchlist.id}
            existingKeys={existingKeys}
            onAdded={() => {
              addedDuringSession.current = true;
            }}
          />

          <WatchlistFormModal
            isOpen={isEditOpen}
            onClose={() => setEditOpen(false)}
            title="Edit watchlist"
            submitLabel="Save"
            initialValues={{
              name: watchlist.name,
              description: watchlist.description,
              isPublic: watchlist.isPublic,
            }}
            onSubmit={handleEdit}
          />

          <ConfirmDestructiveModal
            isOpen={isDeleteOpen}
            onClose={() => setDeleteOpen(false)}
            title={`Delete "${watchlist.name}"?`}
            description={
              items.length > 0
                ? `Are you sure you want to delete this watchlist? This action cannot be undone and you will lose ${items.length} saved ${items.length === 1 ? 'title' : 'titles'}.`
                : 'Are you sure you want to delete this watchlist? This action cannot be undone.'
            }
            confirmLabel="Delete Watchlist"
            onConfirm={confirmDeleteWatchlist}
          />

          <ConfirmDestructiveModal
            isOpen={pendingRemoval !== null}
            onClose={() => setPendingRemoval(null)}
            title={`Remove "${pendingRemoval?.title ?? ''}"?`}
            description={`This will remove it from "${watchlist.name}". You can always add it back later.`}
            confirmLabel="Remove"
            onConfirm={confirmRemoveItem}
          />
        </>
      )}
    </div>
  );
}

/**
 * Upvote control for the detail page. Fetches its own vote state on mount
 * (only mounted when `FEATURES.watchlistUpvoting` is on, so an un-migrated
 * table is never queried). Toggling is optimistic and reverts on error.
 */
function WatchlistUpvoteButton({ watchlistId }: { watchlistId: string }) {
  const toast = useToast();
  const [state, setState] = useState<{ count: number; hasVoted: boolean } | null>(
    null,
  );
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let active = true;
    getWatchlistVoteStateAction(watchlistId)
      .then((s) => {
        if (active) setState(s);
      })
      .catch(() => {
        // Leave state null → control stays hidden rather than showing a
        // misleading zero.
      });
    return () => {
      active = false;
    };
  }, [watchlistId]);

  if (!state) return null;

  const toggle = async () => {
    if (pending) return;
    const previous = state;
    setState({
      count: state.hasVoted ? state.count - 1 : state.count + 1,
      hasVoted: !state.hasVoted,
    });
    setPending(true);
    try {
      const result = await toggleWatchlistUpvoteAction(watchlistId);
      setState({ count: result.count, hasVoted: result.upvoted });
    } catch {
      setState(previous);
      toast.error('Could not update upvote', 'Please try again.');
    } finally {
      setPending(false);
    }
  };

  return (
    <Button
      variant="outline"
      onClick={toggle}
      disabled={pending}
      aria-pressed={state.hasVoted}
      aria-label={state.hasVoted ? 'Remove upvote' : 'Upvote this watchlist'}
      className={cn('gap-2', state.hasVoted && 'border-primary/50 text-primary')}
    >
      <ArrowBigUp
        className={cn('w-4 h-4 transition-colors', state.hasVoted && 'fill-primary')}
      />
      <span className="tabular-nums">{state.count}</span>
    </Button>
  );
}

interface ViewToggleProps {
  viewMode: ViewMode;
  onChange: (next: ViewMode) => void;
}

function ViewToggle({ viewMode, onChange }: ViewToggleProps) {
  return (
    <div className="inline-flex items-center rounded-full border border-border bg-card p-0.5">
      <ToggleButton
        active={viewMode === 'grid'}
        onClick={() => onChange('grid')}
        label="Grid view"
      >
        <LayoutGrid className="w-3.5 h-3.5" />
        Grid
      </ToggleButton>
      <ToggleButton
        active={viewMode === 'list'}
        onClick={() => onChange('list')}
        label="List view"
      >
        <List className="w-3.5 h-3.5" />
        List
      </ToggleButton>
      <ToggleButton
        active={viewMode === 'board'}
        onClick={() => onChange('board')}
        label="Board view"
      >
        <LayoutPanelTop className="w-3.5 h-3.5" />
        Board
      </ToggleButton>
    </div>
  );
}

const AUTO_SORT_HINT =
  "Watchly's auto sort: Watching first, then Rewatch, Up Next, waiting, paused, new, finished, dropped.";

function ListSortToggle({
  listSort,
  onChange,
}: {
  listSort: ListSort;
  onChange: (next: ListSort) => void;
}) {
  return (
    <div className="inline-flex items-center rounded-full border border-border bg-card p-0.5">
      <ToggleButton
        active={listSort === 'rank'}
        onClick={() => onChange('rank')}
        label="Ranked: your curated order"
        title="Your curated order. Drag to rank."
      >
        <ListOrdered className="w-3.5 h-3.5" />
        Ranked
      </ToggleButton>
      <ToggleButton
        active={listSort === 'auto'}
        onClick={() => onChange('auto')}
        label="Auto: Watchly's auto sort by status"
        title={AUTO_SORT_HINT}
      >
        <ArrowDownUp className="w-3.5 h-3.5" />
        Auto
      </ToggleButton>
    </div>
  );
}

function ToggleButton({
  active,
  onClick,
  label,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={title}
      aria-pressed={active}
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full transition-colors cursor-pointer',
        active
          ? 'bg-foreground text-background'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}
