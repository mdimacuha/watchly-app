'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useUIStore } from '@/client/stores/ui';
import Link from 'next/link';
import { History } from 'lucide-react';
import { useToast } from '@/hooks/useToast';
import { useToastStore } from '@/client/stores/toast';
import { SwipeCard, type SwipeCardHandle, type SwipeDirection } from './SwipeCard';
import { SwipeActions } from './SwipeActions';
import { SwipeEmptyState } from './SwipeEmptyState';
import { SkeletonBox } from '@/components/watchly/skeletons';
import { SwipeReel, type ReelFrame, type ReelVerdict } from './SwipeReel';
import { AddToWatchlistPicker } from '@/components/watchlists/AddToWatchlistPicker';
import {
  recordSwipeAction,
  getSwipeDeckAction,
  undoSwipeAction,
} from '@/actions/swipe';
import type { SwipeDeckItem } from '@/services/swipe';
import { SWIPE_PREFETCH_WHEN_REMAINING } from '@/services/swipe/constants';

interface SwipeDeckClientProps {
  initialItems: SwipeDeckItem[];
}

type Action = 'liked' | 'passed' | 'saved' | 'opened';

/** How a swipe was made — recorded in metadata. */
type SwipeInput = 'drag' | 'button' | 'key' | 'details';

const ACTION_DIRECTION: Record<Action, SwipeDirection> = {
  passed: 'left',
  liked: 'right',
  saved: 'up',
  opened: 'up', // never animated; Details doesn't advance the deck
};
const DIRECTION_ACTION: Record<SwipeDirection, Action> = {
  left: 'passed',
  right: 'liked',
  up: 'saved',
};
const ACTION_LABEL: Record<Action, string> = {
  passed: 'Passed',
  liked: 'Liked',
  saved: 'Added to favorites',
  opened: 'Opened',
};

function swipeMetadata(
  item: SwipeDeckItem,
  input: SwipeInput,
  sessionId: string | null,
  position: number,
) {
  return {
    sessionId,
    position,
    input,
    isWildcard: item.isWildcard,
    reason: item.reason,
  };
}

function deckKey(item: Pick<SwipeDeckItem, 'mediaType' | 'tmdbId'>): string {
  return `${item.mediaType}:${item.tmdbId}`;
}

/** Elements where Enter/Space should do their own thing, not a deck shortcut. */
function isInteractive(el: Element | null): boolean {
  return !!el?.closest(
    'button, a, input, textarea, select, [contenteditable="true"], [role="button"], [role="link"]',
  );
}

/**
 * The single most recent committed swipe, stashed so a one-step Undo can
 * restore the card and reverse both the DB row and (only if this swipe
 * newly created it) the favorite.
 */
interface LastSwipe {
  item: SwipeDeckItem;
  action: Action;
  swipeId: string;
  /** True only when THIS swipe created a fresh favorite — the guard that
   *  keeps undo from deleting a pre-existing favorite. */
  favoriteAdded: boolean;
}

/**
 * Orchestrates the deck:
 *   - Renders the top card + one card peeking underneath
 *   - On commit (drag or button), records the swipe + advances
 *   - Pre-fetches another page when the queue runs low
 *   - Listens for keyboard shortcuts (←/→/S/Enter)
 *   - Single-step Undo of the last commit
 *   - Add-to-watchlist for the current card (never advances the deck)
 *
 * Optimistic UX: advance the card before the server responds. If the
 * record fails we toast + push the item back onto the queue front so
 * the user can retry. Drag is disabled while a record is in flight.
 */
export function SwipeDeckClient({ initialItems }: SwipeDeckClientProps) {
  const [items, setItems] = useState<SwipeDeckItem[]>(initialItems);
  const [submitting, setSubmitting] = useState(false);
  const [prefetching, setPrefetching] = useState(false);
  // Last committed swipe — the handle single-step Undo operates on.
  const [lastSwipe, setLastSwipe] = useState<LastSwipe | null>(null);
  // Add-to-watchlist picker. `pickerItem` is captured at open time so the
  // modal keeps targeting the right title even if the deck advances behind it.
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerItem, setPickerItem] = useState<SwipeDeckItem | null>(null);
  const openQuickView = useUIStore((s) => s.openQuickView);
  // Deck shortcuts pause while Quick View is open so arrows/Enter don't
  // swipe the card behind the popup.
  const quickViewOpen = useUIStore((s) => s.quickView !== null);
  const toast = useToast();

  // Synchronous in-flight guard. The `submitting` STATE only flips on
  // next render — if the user taps Save twice in quick succession
  // (or holds 'S', or fires a button + keyboard shortcut on the same
  // frame), both handlers see `submitting === false` and both record
  // a swipe. A ref updates synchronously and shuts the race down.
  const inFlightRef = useRef(false);

  // How long the gate stays closed after a commit STARTS (not after the
  // server answers — see `commit`). Absorbs a double-tap / button+key on the
  // same beat; held-key auto-repeat is already dropped via `e.repeat`. Kept
  // short so the next card is grabbable almost immediately.
  const COMMIT_COOLDOWN_MS = 150;

  const current = items[0] ?? null;
  const next = items[1] ?? null;

  // Prefetch more deck items when we get low. Dedup'd by the
  // `prefetching` flag so multiple low-queue events don't fan out.
  //
  // `deckEnd` stops the loop: if a fetch adds nothing new (deck truly
  // exhausted) or fails, items.length stays low and `prefetching` flips
  // back to false — without this the effect would immediately refetch,
  // forever (~30 TMDB calls per round). Only Refresh clears it.
  const [deckEnd, setDeckEnd] = useState<'exhausted' | 'error' | null>(null);
  // Every title this session has shown (queued or swiped), so a refill
  // can't re-serve a card whose swipe record is still in flight.
  const seenKeys = useRef<Set<string> | null>(null);
  if (seenKeys.current === null) {
    seenKeys.current = new Set(initialItems.map(deckKey));
  }

  useEffect(() => {
    if (items.length > SWIPE_PREFETCH_WHEN_REMAINING) return;
    if (prefetching || deckEnd) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPrefetching(true);
    getSwipeDeckAction({ limit: 20 })
      .then((res) => {
        const seen = seenKeys.current!;
        const fresh = res.items.filter((i) => !seen.has(deckKey(i)));
        if (fresh.length === 0) {
          setDeckEnd('exhausted');
          return;
        }
        for (const i of fresh) seen.add(deckKey(i));
        setItems((prev) => [...prev, ...fresh]);
      })
      .catch(() => setDeckEnd('error'))
      .finally(() => setPrefetching(false));
  }, [items.length, prefetching, deckEnd]);

  // Clearing deckEnd re-arms the prefetch effect above, which fetches a new
  // page (the dead `router.refresh()` didn't — `items` is local state).
  const refreshDeck = useCallback(() => setDeckEnd(null), []);

  // ---- Session context for analytics (stored in title_swipes.metadata) ----
  // Lets us later measure decision/keep rates by deck position, input type
  // and wildcard vs scored cards. Client-only; no schema change.
  const sessionIdRef = useRef<string | null>(null);
  if (sessionIdRef.current === null) sessionIdRef.current = crypto.randomUUID();
  const positionRef = useRef(0);

  // ---- Feedback: screen-reader announcement + undo toast ----
  const [announcement, setAnnouncement] = useState('');
  const { addToast, removeToast } = useToastStore();
  const swipeToastIdRef = useRef<string | null>(null);
  // The toast's Undo button outlives the render that created it, so it
  // calls through a ref to the latest `undo`.
  const undoRef = useRef<() => void>(() => {});
  const dismissSwipeToast = useCallback(() => {
    if (swipeToastIdRef.current) removeToast(swipeToastIdRef.current);
    swipeToastIdRef.current = null;
  }, [removeToast]);

  // This session's swiped cards, newest first, for the reel.
  const [reel, setReel] = useState<ReelFrame[]>([]);

  // Undo slides the restored card back in from the side it left.
  const [entering, setEntering] = useState<{ key: string; from: SwipeDirection } | null>(null);

  // All swipe writes (record, opened, undo) run strictly in order in the
  // background. The UI never waits on them, but an "opened" can't land
  // after the "liked" that followed it, and an undo's delete can't land
  // after a re-swipe of the same card.
  const writeQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const enqueueWrite = useCallback(<T,>(write: () => Promise<T>): Promise<T> => {
    const p = writeQueueRef.current.then(write, write);
    writeQueueRef.current = p.catch(() => {});
    return p;
  }, []);

  // Monotonic id per commit, so a slow server response for an older swipe
  // can't overwrite the undo handle / toast of a newer one.
  const commitSeqRef = useRef(0);

  // Returns whether the commit was accepted. The gate covers only the
  // synchronous advance plus a short cooldown — NOT the server round-trip.
  // Waiting on the network used to block the next card, so a drag released
  // during a slow save flew off and stranded the card ("stuck" deck).
  const commit = useCallback(
    (action: Action, input: SwipeInput): boolean => {
      // Ref check FIRST — bails before the React state read so a duplicate
      // handler on the same frame can't slip past.
      if (!current || inFlightRef.current) return false;
      inFlightRef.current = true;
      setSubmitting(true);
      setTimeout(() => {
        inFlightRef.current = false;
        setSubmitting(false);
      }, COMMIT_COOLDOWN_MS);

      const item = current;
      const seq = ++commitSeqRef.current;
      const metadata = swipeMetadata(item, input, sessionIdRef.current, positionRef.current);
      positionRef.current += 1;
      // Optimistic advance.
      setItems((prev) => prev.slice(1));
      const frameKey = `${deckKey(item)}:${seq}`;
      setReel((prev) => [{ key: frameKey, item, verdict: action as ReelVerdict }, ...prev]);
      setAnnouncement(
        `${ACTION_LABEL[action]}: ${item.title}.${next ? ` Now showing ${next.title}.` : ''}`,
      );

      void enqueueWrite(() =>
        recordSwipeAction({
          tmdbId: item.tmdbId,
          mediaType: item.mediaType,
          action,
          scoreSnapshot: item.recommendationScore,
          metadata,
        }),
      )
        .then((result) => {
          if (seq !== commitSeqRef.current) return; // a newer swipe owns undo
          // Stash as the undoable swipe (single-step). `favoriteAdded`
          // threads through so Undo only reverses a favorite this swipe
          // actually created.
          setLastSwipe({
            item,
            action,
            swipeId: result.swipeId,
            favoriteAdded: result.favoriteAdded,
          });
          // One toast per swipe, replacing the previous one so fast swiping
          // doesn't stack them. It names the verdict and offers Undo.
          dismissSwipeToast();
          swipeToastIdRef.current = addToast({
            type: action === 'passed' ? 'info' : 'success',
            variant: 'action',
            title:
              action === 'saved' && !result.favoriteAdded
                ? 'Already in favorites'
                : ACTION_LABEL[action],
            description: item.title,
            actionLabel: 'Undo',
            onAction: () => undoRef.current(),
            duration: 4000,
          });
        })
        .catch((err) => {
          // Roll back: put the card back on top so the user can retry.
          setItems((prev) => [item, ...prev]);
          setReel((prev) => prev.filter((f) => f.key !== frameKey));
          toast.error(
            'Swipe failed',
            err instanceof Error ? err.message : 'Please try again.',
          );
        });
      return true;
    },
    [current, next, toast, addToast, dismissSwipeToast, enqueueWrite],
  );

  // Single-step Undo. Restores the last committed card to the FRONT of the
  // queue, reverses client state, and deletes the swipe server-side (plus
  // the favorite when this swipe created it). Guarded against firing during
  // an in-flight commit via the same inFlightRef gate.
  const undo = useCallback(async () => {
    if (inFlightRef.current || !lastSwipe) return;
    // Same short gate as a commit — the server delete runs in the ordered
    // write queue, so the deck doesn't wait on it.
    inFlightRef.current = true;
    setSubmitting(true);
    setTimeout(() => {
      inFlightRef.current = false;
      setSubmitting(false);
    }, COMMIT_COOLDOWN_MS);
    const snapshot = lastSwipe;
    // Reverse client state immediately: card returns to the front (sliding
    // in from where it left), handle clears so Undo disables until the next
    // commit, and the "Liked · X [Undo]" toast goes away.
    setEntering({ key: deckKey(snapshot.item), from: ACTION_DIRECTION[snapshot.action] });
    setItems((prev) => [snapshot.item, ...prev]);
    setLastSwipe(null);
    dismissSwipeToast();
    setReel((prev) => {
      const i = prev.findIndex((f) => deckKey(f.item) === deckKey(snapshot.item));
      return i === -1 ? prev : [...prev.slice(0, i), ...prev.slice(i + 1)];
    });
    positionRef.current = Math.max(0, positionRef.current - 1);
    setAnnouncement(`Undid ${ACTION_LABEL[snapshot.action].toLowerCase()}: ${snapshot.item.title}.`);

    try {
      await enqueueWrite(() =>
        undoSwipeAction({
          swipeId: snapshot.swipeId,
          tmdbId: snapshot.item.tmdbId,
          mediaType: snapshot.item.mediaType,
          reverseFavorite: snapshot.favoriteAdded,
        }),
      );
      if (snapshot.favoriteAdded) {
        toast.info('Removed from favorites', snapshot.item.title);
      }
    } catch (err) {
      // The card is already back in the deck; the server swipe may persist.
      // Re-swiping upserts, so we don't try to re-stash the handle.
      toast.error(
        'Undo failed',
        err instanceof Error ? err.message : 'Please try again.',
      );
    }
  }, [lastSwipe, toast, dismissSwipeToast, enqueueWrite]);

  useEffect(() => {
    undoRef.current = () => void undo();
  }, [undo]);

  // Buttons and keys route through the card so they play the same exit
  // animation as a drag; the card calls back into `commit` when it lands.
  // Checks the in-flight gate first — otherwise the card could fly off
  // while the deck refuses the commit, leaving it stranded off-screen.
  const cardRef = useRef<SwipeCardHandle>(null);
  const pendingInputRef = useRef<SwipeInput>('button');
  const swipe = useCallback(
    (action: Action, input: SwipeInput) => {
      if (!current || inFlightRef.current) return;
      pendingInputRef.current = input;
      if (cardRef.current) cardRef.current.swipe(ACTION_DIRECTION[action]);
      else commit(action, input);
    },
    [current, commit],
  );
  const handleCardSwipe = useCallback(
    (direction: SwipeDirection, viaDrag: boolean) =>
      commit(DIRECTION_ACTION[direction], viaDrag ? 'drag' : pendingInputRef.current),
    [commit],
  );
  // Asked by the card on drag release: refuse early (spring back) rather
  // than fly off and get rejected.
  const canCommit = useCallback(() => !inFlightRef.current, []);

  const openAddToWatchlist = useCallback(() => {
    if (!current) return;
    setPickerItem(current);
    setPickerOpen(true);
  }, [current]);

  const handleDetails = useCallback(() => {
    if (!current) return;
    // Record the curiosity signal without advancing, and open Quick View
    // over the deck so the user can inspect and keep swiping. No gate: the
    // write is queued in order, so it can't block (or overwrite) the
    // verdict that follows.
    const item = current;
    openQuickView(item.mediaType, String(item.tmdbId));
    void enqueueWrite(() =>
      recordSwipeAction({
        tmdbId: item.tmdbId,
        mediaType: item.mediaType,
        action: 'opened',
        scoreSnapshot: item.recommendationScore,
        metadata: swipeMetadata(item, 'details', sessionIdRef.current, positionRef.current),
      }),
    ).catch(() => {
      // Non-fatal — the popup is already open.
    });
  }, [current, openQuickView, enqueueWrite]);

  // Keyboard shortcuts — only active when there's a card, nothing in flight,
  // and the add-to-watchlist picker is closed (so typing a new list name or
  // the modal's own keys don't also swipe the deck behind it). ←/→ for
  // pass/like, S to save, Enter for details.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (pickerOpen || quickViewOpen) return;
      // Ignore OS keyboard auto-repeat. Holding a key briefly (200-300ms
      // depending on OS settings) would otherwise fire commit on the
      // NEXT card after the first commit's cooldown elapses — looks to
      // the user like a phantom save.
      if (e.repeat) return;
      // Leave browser/OS combos alone (Ctrl+S, Cmd+L, Alt+←…) — they used
      // to favorite/like/pass the card.
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // Don't capture keys typed into inputs (none on this page today,
      // but defensive).
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      // Enter on a focused button/link must activate THAT control (Undo,
      // History, Pass…), not open Details. Letter/arrow shortcuts still
      // work after clicking a button, since focus stays on it.
      if (e.key === 'Enter' && isInteractive(t)) return;

      // Undo works even after the last card is gone.
      if (e.key === 'z' || e.key === 'Z' || e.key === 'Backspace') {
        if (!lastSwipe) return;
        e.preventDefault();
        void undo();
        return;
      }

      if (!current || inFlightRef.current) return;
      if (e.key === 'ArrowLeft' || e.key === 'x' || e.key === 'X') {
        e.preventDefault();
        swipe('passed', 'key');
      } else if (e.key === 'ArrowRight' || e.key === 'l' || e.key === 'L') {
        e.preventDefault();
        swipe('liked', 'key');
      } else if (e.key === 'f' || e.key === 'F' || e.key === 's' || e.key === 'S') {
        e.preventDefault();
        swipe('saved', 'key');
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleDetails();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, swipe, undo, lastSwipe, handleDetails, pickerOpen, quickViewOpen]);

  return (
    <div className="flex flex-col gap-6">
      {/* Screen readers hear each verdict and the next title. */}
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      {current ? (
        <>
          {/* Card stack — portrait poster ratio. On phones the width is also
              capped by viewport height so the action row stays on screen. */}
          <div className="relative w-full max-w-[min(32rem,42svh)] sm:max-w-lg mx-auto aspect-[2/3]">
            {next && (
              <SwipeCard
                key={deckKey(next)}
                item={next}
                active={false}
                onSwipe={() => false}
              />
            )}
            <SwipeCard
              key={deckKey(current)}
              ref={cardRef}
              item={current}
              active
              canCommit={canCommit}
              enterFrom={entering?.key === deckKey(current) ? entering.from : undefined}
              onSwipe={handleCardSwipe}
            />
          </div>

          <SwipeActions
            onPass={() => swipe('passed', 'button')}
            onLike={() => swipe('liked', 'button')}
            onFavorite={() => swipe('saved', 'button')}
            onDetails={handleDetails}
            onAddToWatchlist={openAddToWatchlist}
            disabled={submitting}
          />
        </>
      ) : prefetching ? (
        // Out of cards but more are on the way — don't claim "all caught up".
        <div
          role="status"
          className="relative w-full max-w-[min(32rem,42svh)] sm:max-w-lg mx-auto aspect-[2/3] flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-card"
        >
          <SkeletonBox className="absolute inset-0 rounded-xl" />
          <span className="relative text-sm text-muted-foreground">Finding more picks…</span>
        </div>
      ) : (
        <SwipeEmptyState
          reason={deckEnd === 'error' ? 'error' : 'exhausted'}
          onRefresh={refreshDeck}
        />
      )}

      {/* Session reel: feedback, history and undo (Rewind / Z / pull up). */}
      <SwipeReel
        frames={reel}
        canUndo={!!lastSwipe && !submitting}
        onUndo={() => void undo()}
        onOpen={(item) => openQuickView(item.mediaType, String(item.tmdbId))}
        remaining={items.length}
      />

      {/* Undo and the "N left" counter live in the reel now. */}
      <div className="flex items-center justify-center text-xs text-muted-foreground">
        <Link
          href="/swipe/history"
          className="inline-flex h-11 items-center gap-1.5 rounded-md px-3 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <History className="w-3.5 h-3.5" />
          History
        </Link>
      </div>

      {pickerItem && (
        <AddToWatchlistPicker
          isOpen={pickerOpen}
          onClose={() => setPickerOpen(false)}
          mediaType={pickerItem.mediaType}
          mediaId={String(pickerItem.tmdbId)}
        />
      )}
    </div>
  );
}
