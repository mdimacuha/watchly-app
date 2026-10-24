'use client';

import { useState } from 'react';
import { applyTidyAction, undoTidyAction } from '@/actions/watchlists';
import { useToast } from '@/hooks/useToast';
import type { AttentionEntry } from '@/services/watchlists/attention';
import type { TidyAction } from '@/services/watchlists/tidy';
import type { WatchlistItemStatus } from '@/services/watchlists/validators';

// Applies Tidy up choices: one server call per choice (a batch for "Mark all
// finished"), optimistic, with an Undo toast that restores the rows exactly
// (status, dates, rank, notes). "skip" (Not tonight) only hides the
// suggestion for this visit.

export type Choice = TidyAction | 'skip';

const TO_STATUS: Partial<Record<Choice, WatchlistItemStatus>> = {
  finish: 'finished',
  watching: 'watching',
  up_next: 'up_next',
  pause: 'paused',
  drop: 'dropped',
};

const DONE: Record<Choice, string> = {
  finish: 'Marked finished',
  watching: 'Moved to Watching',
  up_next: 'Moved to Up Next',
  pause: 'Paused',
  drop: 'Dropped',
  remove: 'Let go',
  keep: 'Kept as it is',
  skip: 'Not tonight',
};

/** What the list on screen should mirror after a choice (or its undo). */
export type TidyChange = { itemId: string; status: WatchlistItemStatus } | { itemId: string; removed: true } | { restored: true };

export function useTidy(initial: AttentionEntry[], onChange?: (c: TidyChange) => void) {
  const toast = useToast();
  const [entries, setEntries] = useState(initial);
  const [busy, setBusy] = useState(false);

  const hide = (batch: AttentionEntry[]) => setEntries((cur) => cur.filter((e) => !batch.some((b) => b.key === e.key)));
  const restore = (batch: AttentionEntry[]) => setEntries((cur) => [...batch, ...cur.filter((e) => !batch.some((b) => b.key === e.key))]);

  async function apply(batch: AttentionEntry[], c: Choice) {
    if (!batch.length || busy) return;
    hide(batch);
    if (c === 'skip') return;
    setBusy(true);
    try {
      const snapshot = await applyTidyAction({ action: c, itemIds: batch.map((e) => e.itemId), kind: batch[0].kind });
      const status = TO_STATUS[c];
      for (const e of batch) {
        if (status) onChange?.({ itemId: e.itemId, status });
        if (c === 'remove') onChange?.({ itemId: e.itemId, removed: true });
      }
      toast.custom({
        title: batch.length === 1 ? `${DONE[c]}: ${batch[0].title}` : `${DONE[c]}: ${batch.length} titles`,
        type: 'success',
        variant: 'action',
        duration: 8000,
        actionLabel: 'Undo',
        onAction: () => {
          restore(batch);
          undoTidyAction(snapshot)
            .then(() => onChange?.({ restored: true }))
            .catch(() => {
              hide(batch);
              toast.error('Could not undo', 'Reload and try again.');
            });
        },
      });
    } catch {
      restore(batch);
      toast.error('Could not save that', 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return { entries, busy, apply };
}
