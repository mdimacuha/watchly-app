'use client';

import { useEffect, useRef, useState } from 'react';
import { addToWatchlistAction, getListRecsAction, recordWatchlistEventAction, removeFromWatchlistAction } from '@/actions/watchlists';
import { useToast } from '@/hooks/useToast';
import type { ListRec } from '@/services/watchlists/recs';

/** Picks on show at once, and at most this many under one list title. */
export const SHOWN = 12;
export const PER_SEED = 3;

type Phase = 'idle' | 'loading' | 'error' | 'thin' | 'ready';

/**
 * More for this list. Nothing is fetched until the first open; the picks
 * then stay for the visit. Picks come in rounds (the list's next titles as
 * seeds, then deeper pages): when fewer than a screenful is left (after
 * adds, or "More picks" setting the shown ones aside) the next round loads
 * in the background, until there's nothing left to try. Adding takes the
 * card out at once; Undo takes the title off the list and puts it back.
 */
export function useListRecs(watchlistId: string, onListChanged: () => void) {
  const toast = useToast();
  const [phase, setPhase] = useState<Phase>('idle');
  const [need, setNeed] = useState(0);
  const [picks, setPicks] = useState<ListRec[]>([]);
  const [taken, setTaken] = useState<Set<string>>(new Set());
  const [passed, setPassed] = useState<Set<string>>(new Set());
  const [done, setDone] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const nextRound = useRef(0);
  const opened = useRef(false);

  const available = picks.filter((p) => !taken.has(p.key) && !passed.has(p.key));
  // A screenful, best first, no more than PER_SEED under any one list title.
  const shown: ListRec[] = [];
  const perSeed = new Map<string, number>();
  for (const p of available) {
    if (shown.length >= SHOWN) break;
    const n = perSeed.get(p.seedKey) ?? 0;
    if (n >= PER_SEED) continue;
    perSeed.set(p.seedKey, n + 1);
    shown.push(p);
  }

  /** One round; keeps going (up to 3 rounds) while a round brings nothing new. */
  async function fetchMore(first = false) {
    if (fetching) return;
    setFetching(true);
    if (first) setPhase('loading');
    try {
      for (let tries = 0; tries < 3; tries++) {
        const round = nextRound.current++;
        const res = await getListRecsAction(watchlistId, round);
        if (res.status === 'thin') {
          setNeed(res.need);
          setPhase('thin');
          return;
        }
        let added = 0;
        setPicks((cur) => {
          const have = new Set(cur.map((p) => p.key));
          const fresh = res.picks.filter((p) => !have.has(p.key));
          added = fresh.length;
          return [...cur, ...fresh];
        });
        setPhase('ready');
        if (res.done) {
          setDone(true);
          return;
        }
        if (added > 0) return;
      }
    } catch {
      if (first) setPhase('error');
    } finally {
      setFetching(false);
    }
  }

  /** Call when the accordion opens: the first time only, it loads. */
  function onOpen() {
    if (opened.current) return;
    opened.current = true;
    void recordWatchlistEventAction({ event: 'recs_opened', metadata: { listId: watchlistId } }).catch(() => {});
    void fetchMore(true);
  }

  // Keep a screenful: top up from the next round when it runs low.
  // (Fetching starts from this effect on purpose: it reacts to the count
  // dropping, whatever dropped it, and the guard stops it re-running.)
  useEffect(() => {
    if (phase !== 'ready' || done || fetching || shown.length >= SHOWN) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the top-up fetch, guarded above
    void fetchMore();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- topping up depends only on these
  }, [phase, done, fetching, shown.length]);

  /** "More picks": set these aside for the visit and show the next ones. */
  function showMore() {
    setPassed((cur) => new Set([...cur, ...shown.map((p) => p.key)]));
  }

  async function add(rec: ListRec, rank: number) {
    if (busy) return;
    setBusy(rec.key);
    setTaken((t) => new Set(t).add(rec.key));
    const untake = () =>
      setTaken((t) => {
        const n = new Set(t);
        n.delete(rec.key);
        return n;
      });
    try {
      await addToWatchlistAction(watchlistId, rec.mediaType, String(rec.tmdbId), `recs:${rank}`);
      onListChanged();
      toast.custom({
        title: `Added: ${rec.title}`,
        description: `Because ${rec.seedTitle} is on this list.`,
        type: 'success',
        variant: 'action',
        duration: 6000,
        actionLabel: 'Undo',
        onAction: () => {
          untake();
          void removeFromWatchlistAction(watchlistId, rec.mediaType, String(rec.tmdbId))
            .then(onListChanged)
            .catch(() => toast.error('Could not undo', 'Reload and try again.'));
        },
      });
    } catch {
      untake();
      toast.error('Could not add', 'Please try again.');
    } finally {
      setBusy(null);
    }
  }

  return {
    phase,
    need,
    shown,
    /** More are waiting, or another round can be asked for. */
    canShowMore: available.length > shown.length || !done,
    fetching,
    done,
    busy,
    onOpen,
    retry: () => {
      nextRound.current = 0;
      void fetchMore(true);
    },
    showMore,
    add,
  };
}
