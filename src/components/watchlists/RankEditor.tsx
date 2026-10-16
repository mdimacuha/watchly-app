'use client';

import { useRef, useState } from 'react';
import { cn } from '@/lib/cn';

interface RankEditorProps {
  /** null = not ranked yet, shown as "--". */
  rank: number | null;
  /** Highest allowed rank (the number of items in the watchlist). */
  max: number;
  /** Provide to make the rank editable (owner only). 0 = unrank. */
  onSubmit?: (rank: number) => void;
}

/**
 * The big rank number in the List view. Owners click it to type a new rank:
 * 0 unranks (back to "Recently Added"), 1..max places it. Enter/blur saves,
 * Escape cancels; out-of-range input is rejected.
 */
export function RankEditor({ rank, max, onSubmit }: RankEditorProps) {
  const [draft, setDraft] = useState<string | null>(null);
  // Escape cancels by blurring with this set, so onBlur skips the save.
  const cancelRef = useRef(false);
  const label = rank === null ? '--' : String(rank).padStart(2, '0');
  const textClass =
    'text-xl sm:text-3xl font-bold tabular-nums leading-none text-muted-foreground/50';

  if (!onSubmit) {
    return (
      <span aria-hidden className={cn('w-8 sm:w-10 shrink-0', textClass)}>
        {label}
      </span>
    );
  }

  const value = draft === null ? NaN : Number(draft);
  const isValid =
    draft !== null && draft.trim() !== '' && Number.isInteger(value) && value >= 0 && value <= max;

  const commit = () => {
    if (!cancelRef.current && isValid && value !== (rank ?? 0)) onSubmit(value);
    cancelRef.current = false;
    setDraft(null);
  };

  if (draft !== null) {
    return (
      <div className="w-14 sm:w-16 shrink-0">
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={max}
          step={1}
          value={draft}
          autoFocus
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            // Blur → onBlur commits, so Enter can't double-submit.
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') {
              cancelRef.current = true;
              e.currentTarget.blur();
            }
          }}
          aria-label={`Rank, 0 to unrank or 1 to ${max}`}
          aria-invalid={!isValid}
          className={cn(
            'w-full rounded-md border bg-card px-1.5 py-1 text-lg font-bold tabular-nums text-foreground outline-none',
            isValid ? 'border-border focus:border-primary' : 'border-destructive',
          )}
        />      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setDraft(rank === null ? '' : String(rank))}
      aria-label={rank === null ? 'Unranked. Set rank' : `Rank ${rank}. Change rank`}
      title="Click to set rank (0 to unrank)"
      className={cn(
        'w-8 sm:w-10 shrink-0 self-start text-left rounded-sm cursor-pointer hover:text-foreground transition-colors',
        textClass,
      )}
    >
      {label}
    </button>
  );
}
