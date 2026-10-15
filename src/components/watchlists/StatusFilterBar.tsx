'use client';

import { useState } from 'react';
import { cn } from '@/lib/cn';
import { STATUS_META, STATUS_ORDER } from './StatusChip';
import type { WatchlistItemStatus } from '@/services/watchlists';

export type StatusFilter = 'all' | WatchlistItemStatus;

interface StatusFilterBarProps {
  active: StatusFilter;
  /** Map of status → count of items in that bucket (computed by the parent). */
  counts: Record<WatchlistItemStatus, number>;
  totalCount: number;
  onChange: (next: StatusFilter) => void;
}

export function StatusFilterBar({
  active,
  counts,
  totalCount,
  onChange,
}: StatusFilterBarProps) {
  // Hide zero-count chips by default — they're noise for users who only
  // use a few of the 9 statuses. The "Show all" toggle expands.
  const [showEmpty, setShowEmpty] = useState(false);

  // Always render a chip when:
  //  - the status has items, OR
  //  - the user is currently filtering by that status (even if it just
  //    dropped to 0 from a status change — the chip needs to stay visible
  //    so the active filter has a UI handle).
  const visibleStatuses = STATUS_ORDER.filter(
    (s) => showEmpty || counts[s] > 0 || active === s,
  );
  const emptyCount = STATUS_ORDER.filter((s) => counts[s] === 0).length;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <FilterPill
        label="All"
        count={totalCount}
        isActive={active === 'all'}
        onClick={() => onChange('all')}
      />
      {visibleStatuses.map((s) => {
        const meta = STATUS_META[s];
        return (
          <FilterPill
            key={s}
            label={meta.label}
            count={counts[s]}
            dotClass={meta.dotClass}
            isActive={active === s}
            onClick={() => onChange(s)}
          />
        );
      })}
      {emptyCount > 0 && (
        <button
          type="button"
          onClick={() => setShowEmpty((v) => !v)}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer px-2 py-1 underline-offset-2 hover:underline"
        >
          {showEmpty ? 'Hide empty' : `Show all (+${emptyCount})`}
        </button>
      )}
    </div>
  );
}

interface FilterPillProps {
  label: string;
  count: number;
  dotClass?: string;
  isActive: boolean;
  onClick: () => void;
}

function FilterPill({ label, count, dotClass, isActive, onClick }: FilterPillProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors cursor-pointer',
        isActive
          ? 'bg-foreground text-background border-foreground'
          : 'bg-card text-muted-foreground border-border hover:text-foreground hover:border-foreground/50',
      )}
    >
      {dotClass && (
        <span className={cn('w-1.5 h-1.5 rounded-full', dotClass)} />
      )}
      {label}
      <span
        className={cn(
          'text-[10px] tabular-nums px-1.5 py-0.5 rounded-full',
          isActive ? 'bg-background/10 text-background' : 'bg-muted text-muted-foreground',
        )}
      >
        {count}
      </span>
    </button>
  );
}
