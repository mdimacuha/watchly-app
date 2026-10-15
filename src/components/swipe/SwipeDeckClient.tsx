'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { RotateCcw, History } from 'lucide-react';
import { useToast } from '@/hooks/useToast';
import { SwipeCard } from './SwipeCard';
import { SwipeActions } from './SwipeActions';
import { SwipeEmptyState } from './SwipeEmptyState';
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
  const [, startTransition] = useTransition();
  const [prefetching, setPrefetching] = useState(false);
  // Last committed swipe — the handle single-step Undo operates on.
  const [lastSwipe, setLastSwipe] = useState<LastSwipe | null>(null);
  // Add-to-watchlist picker. `pickerItem` is captured at open time so the
  // modal keeps targeting the right title even if the deck advances behind it.
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerItem, setPickerItem] = useState<SwipeDeckItem | null>(null);
  const router = useRouter();
  const toast = useToast();

  // Synchronous in-flight guard. The `submitting` STATE only flips on
  // next render — if the user taps Save twice in quick succession
  // (or holds 'S', or fires a button + keyboard shortcut on the same
  // frame), both handlers see `submitting === false` and both record
  // a swipe. A ref updates synchronously and shuts the race down.
  const inFlightRef = useRef(false);

  // Minimum time the in-flight gate stays closed AFTER a commit
  // resolves. Without this, the server can respond in ~50ms and a
  // held-down 'S' key (keyboard auto-repeat fires every ~30ms once it
  // kicks in) will commit on the NEXT card — different title, same
  // user intent, two unintended Saves. 280ms is long enough to absorb
  // a 1-2 frame OS auto-repeat burst without feeling laggy when the
  // user genuinely meant to swipe twice in a row.
  const COMMIT_COOLDOWN_MS = 280;

  const current = items[0] ?? null;
  const next = items[1] ?? null;

  // Prefetch more deck items when we get low. Dedup'd by the
  // `prefetching` flag so multiple low-queue events don't fan out.
  useEffect(() => {
    if (items.length > SWIPE_PREFETCH_WHEN_REMAINING) return;
    if (prefetching) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPrefetching(true);
    getSwipeDeckAction({ limit: 20 })
      .then((res) => {
        setItems((prev) => {
          // Drop server items that are already in the local queue —
          // the server doesn't know what we just swiped.
          const localKeys = new Set(
            prev.map((p) => `${p.mediaType}:${p.tmdbId}`),
          );
          const fresh = res.items.filter(
            (i) => !localKeys.has(`${i.mediaType}:${i.tmdbId}`),
          );
          return [...prev, ...fresh];
        });
      })
      .catch(() => {
        // Non-fatal — user can keep going until empty + then refresh.
      })
      .finally(() => setPrefetching(false));
  }, [items.length, prefetching]);

  const commit = useCallback(
    async (action: Action) => {
      // Ref check FIRST — bails before the React state read so the
      // duplicate handler can't slip past. The `submitting` state is
      // kept only to drive the disabled visual on the buttons.
      if (!current || inFlightRef.current) return;
      inFlightRef.current = true;
      const item = current;
      setSubmitting(true);
      // Optimistic advance.
      setItems((prev) => prev.slice(1));

      try {
        const result = await recordSwipeAction({
          tmdbId: item.tmdbId,
          mediaType: item.mediaType,
          action,
          scoreSnapshot: item.recommendationScore,
        });
        // Stash as the undoable swipe (single-step — this replaces any
        // prior handle). `favoriteAdded` threads through so Undo only
        // reverses a favorite this swipe actually created.
        setLastSwipe({
          item,
          action,
          swipeId: result.swipeId,
          favoriteAdded: result.favoriteAdded,
        });
        if (action === 'saved') {
          toast.success(
            result.favoriteAdded ? 'Saved to favorites' : 'Already in favorites',
            item.title,
          );
        }
      } catch (err) {
        // Roll back: push the item back at the front of the queue so
        // the user can retry. Surface the error via toast. Leave any
        // prior undoable swipe untouched.
        setItems((prev) => [item, ...prev]);
        toast.error(
          'Swipe failed',
          err instanceof Error ? err.message : 'Please try again.',
        );
      } finally {
        // Cooldown window — see COMMIT_COOLDOWN_MS comment.
        setTimeout(() => {
          inFlightRef.current = false;
          setSubmitting(false);
        }, COMMIT_COOLDOWN_MS);
      }
    },
    [current, toast],
  );

  // Single-step Undo. Restores the last committed card to the FRONT of the
  // queue, reverses client state, and deletes the swipe server-side (plus
  // the favorite when this swipe created it). Guarded against firing during
  // an in-flight commit via the same inFlightRef gate.
  const undo = useCallback(async () => {
    if (inFlightRef.current || !lastSwipe) return;
    inFlightRef.current = true;
    setSubmitting(true);
    const snapshot = lastSwipe;
    // Reverse client state immediately: card returns to the front, handle
    // clears so Undo disables until the next commit.
    setItems((prev) => [snapshot.item, ...prev]);
    setLastSwipe(null);

    try {
      await undoSwipeAction({
        swipeId: snapshot.swipeId,
        tmdbId: snapshot.item.tmdbId,
        mediaType: snapshot.item.mediaType,
        reverseFavorite: snapshot.favoriteAdded,
      });
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
    } finally {
      setTimeout(() => {
        inFlightRef.current = false;
        setSubmitting(false);
      }, COMMIT_COOLDOWN_MS);
    }
  }, [lastSwipe, toast]);

  const openAddToWatchlist = useCallback(() => {
    if (!current) return;
    setPickerItem(current);
    setPickerOpen(true);
  }, [current]);

  const handleDetails = useCallback(() => {
    if (!current || inFlightRef.current) return;
    inFlightRef.current = true;
    // Record the curiosity signal without optimistic advance — the user
    // is leaving the page, so navigation IS the action.
    const item = current;
    startTransition(async () => {
      try {
        await recordSwipeAction({
          tmdbId: item.tmdbId,
          mediaType: item.mediaType,
          action: 'opened',
          scoreSnapshot: item.recommendationScore,
        });
      } catch {
        // Non-fatal — proceed to nav regardless.
      }
      router.push(`/title/${item.mediaType}/${item.tmdbId}`);
    });
    // We intentionally don't reset inFlightRef here — navigation has
    // started and we don't want a fast keyboard double-press to fire
    // a stale recordSwipe against the next page's mount.
  }, [current, router]);

  // Keyboard shortcuts — only active when there's a card, nothing in flight,
  // and the add-to-watchlist picker is closed (so typing a new list name or
  // the modal's own keys don't also swipe the deck behind it). ←/→ for
  // pass/like, S to save, Enter for details.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!current || inFlightRef.current || pickerOpen) return;
      // Ignore OS keyboard auto-repeat. Holding a key briefly (200-300ms
      // depending on OS settings) would otherwise fire commit on the
      // NEXT card after the first commit's cooldown elapses — looks to
      // the user like a phantom save.
      if (e.repeat) return;
      // Don't capture keys typed into inputs (none on this page today,
      // but defensive).
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (e.key === 'ArrowLeft' || e.key === 'x' || e.key === 'X') {
        e.preventDefault();
        commit('passed');
      } else if (e.key === 'ArrowRight' || e.key === 'l' || e.key === 'L') {
        e.preventDefault();
        commit('liked');
      } else if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        commit('saved');
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleDetails();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, commit, handleDetails, pickerOpen]);

  return (
    <div className="flex flex-col gap-6">
      {current ? (
        <>
          {/* Card stack — aspect ratio matches a portrait poster. The
              max-width was bumped from max-md to max-lg so the card reads
              as the focal element on desktop (the original ~28rem felt
              dwarfed inside the page container). */}
          <div className="relative w-full max-w-lg mx-auto aspect-[2/3]">
            {next && (
              <SwipeCard
                key={`${next.mediaType}:${next.tmdbId}`}
                item={next}
                active={false}
                onSwipeLeft={() => {}}
                onSwipeRight={() => {}}
              />
            )}
            <SwipeCard
              key={`${current.mediaType}:${current.tmdbId}`}
              item={current}
              active
              onSwipeLeft={() => commit('passed')}
              onSwipeRight={() => commit('liked')}
            />
          </div>

          <SwipeActions
            onPass={() => commit('passed')}
            onLike={() => commit('liked')}
            onSave={() => commit('saved')}
            onDetails={handleDetails}
            onAddToWatchlist={openAddToWatchlist}
            disabled={submitting}
          />
        </>
      ) : (
        <SwipeEmptyState reason="exhausted" />
      )}

      <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
        <button
          type="button"
          onClick={undo}
          disabled={!lastSwipe || submitting}
          aria-label="Undo last swipe"
          title="Undo last swipe"
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 transition-colors hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Undo
        </button>
        {current && (
          <span>
            {items.length} left{prefetching ? ' · fetching more…' : ''}
          </span>
        )}
        <Link
          href="/swipe/history"
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
