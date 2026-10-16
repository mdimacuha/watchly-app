'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { WatchlistItemStatus } from '@/services/watchlists';

interface StatusChipProps {
  status: WatchlistItemStatus;
  /** Provide to enable editing — owner-only. Omit for read-only chip. */
  onChange?: (next: WatchlistItemStatus) => void;
  size?: 'sm' | 'md';
  /**
   * Menu open direction. 'down' = under the chip (default — works under cards);
   * 'up' = above the chip (legacy use-on-poster).
   */
  menuPlacement?: 'down' | 'up';
  className?: string;
}

interface StatusMeta {
  label: string;
  dotClass: string;
  pillClass: string;
}

// Tailwind safelisted by being literal strings. Each pill has dark-mode
// defaults + `light:` overrides for light theme. Dark variant: translucent
// color overlay on near-black + very light text. Light variant: solid pale
// color bg + dark text — both ensure WCAG-readable contrast.
export const STATUS_META: Record<WatchlistItemStatus, StatusMeta> = {
  just_added: {
    label: 'Just Added',
    dotClass: 'bg-zinc-400',
    pillClass:
      'bg-zinc-500/20 text-zinc-100 border-zinc-400/30 ' +
      'light:bg-zinc-100 light:text-zinc-700 light:border-zinc-300',
  },
  up_next: {
    label: 'Up Next',
    dotClass: 'bg-blue-400',
    pillClass:
      'bg-blue-500/20 text-blue-100 border-blue-400/30 ' +
      'light:bg-blue-100 light:text-blue-700 light:border-blue-300',
  },
  watching: {
    label: 'Watching',
    dotClass: 'bg-amber-400',
    pillClass:
      'bg-amber-500/20 text-amber-100 border-amber-400/40 ' +
      'light:bg-amber-100 light:text-amber-700 light:border-amber-300',
  },
  waiting_for_episode: {
    label: 'Waiting for Episode',
    dotClass: 'bg-cyan-400',
    pillClass:
      'bg-cyan-500/20 text-cyan-100 border-cyan-400/30 ' +
      'light:bg-cyan-100 light:text-cyan-700 light:border-cyan-300',
  },
  waiting_for_season: {
    label: 'Waiting for Season',
    dotClass: 'bg-indigo-400',
    pillClass:
      'bg-indigo-500/20 text-indigo-100 border-indigo-400/30 ' +
      'light:bg-indigo-100 light:text-indigo-700 light:border-indigo-300',
  },
  paused: {
    label: 'Paused',
    dotClass: 'bg-orange-400',
    pillClass:
      'bg-orange-500/20 text-orange-100 border-orange-400/30 ' +
      'light:bg-orange-100 light:text-orange-700 light:border-orange-300',
  },
  finished: {
    label: 'Finished',
    dotClass: 'bg-emerald-400',
    pillClass:
      'bg-emerald-500/20 text-emerald-100 border-emerald-400/30 ' +
      'light:bg-emerald-100 light:text-emerald-700 light:border-emerald-300',
  },
  rewatch: {
    label: 'Rewatch',
    dotClass: 'bg-purple-400',
    pillClass:
      'bg-purple-500/20 text-purple-100 border-purple-400/30 ' +
      'light:bg-purple-100 light:text-purple-700 light:border-purple-300',
  },
  dropped: {
    label: 'Dropped',
    dotClass: 'bg-rose-400',
    pillClass:
      'bg-rose-500/20 text-rose-100 border-rose-400/30 ' +
      'light:bg-rose-100 light:text-rose-700 light:border-rose-300',
  },
};

// List-view sort priority: "what should I watch now?" Actionable first
// (in progress → queued), then blocked/on hold, then untriaged, then done.
// Lower = higher in the list.
export const STATUS_PRIORITY: Record<WatchlistItemStatus, number> = {
  watching: 0,
  rewatch: 1,
  up_next: 2,
  waiting_for_episode: 3,
  waiting_for_season: 4,
  paused: 5,
  just_added: 6,
  finished: 7,
  dropped: 8,
};

// Display order across all UI: roughly follows the watching journey —
// pre-watch → in-progress → on-hold → completed → re-experience → abandoned.
export const STATUS_ORDER: WatchlistItemStatus[] = [
  'just_added',
  'up_next',
  'watching',
  'waiting_for_episode',
  'waiting_for_season',
  'paused',
  'finished',
  'rewatch',
  'dropped',
];

export function StatusChip({
  status,
  onChange,
  size = 'sm',
  menuPlacement = 'down',
  className,
}: StatusChipProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const editable = Boolean(onChange);

  // Outside-click and Escape close the menu. Mounted only when open.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const meta = STATUS_META[status];

  const sizing =
    size === 'sm'
      ? 'px-2 py-0.5 text-[10px] gap-1.5'
      : 'px-2.5 py-1 text-xs gap-2';

  // Read-only render: just the pill, no button affordance.
  if (!editable) {
    return (
      <span
        className={cn(
          'inline-flex items-center rounded-full font-semibold uppercase tracking-wider border backdrop-blur-sm',
          meta.pillClass,
          sizing,
          className,
        )}
      >
        <span className={cn('w-1.5 h-1.5 rounded-full', meta.dotClass)} />
        {meta.label}
      </span>
    );
  }

  return (
    <div ref={rootRef} className={cn('relative inline-block', className)}>
      <button
        type="button"
        onClick={(e) => {
          // Belt-and-suspenders: the chip used to live inside a <Link>. It now
          // lives in the card footer outside the Link, but keep these in case
          // a caller drops it back inside a clickable wrapper.
          e.preventDefault();
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          'inline-flex items-center rounded-full font-semibold uppercase tracking-wider border cursor-pointer hover:brightness-110 transition',
          meta.pillClass,
          sizing,
        )}
      >
        <span className={cn('w-1.5 h-1.5 rounded-full', meta.dotClass)} />
        {meta.label}
        <ChevronDown
          className={cn(
            'ml-0.5 transition-transform',
            size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5',
            open && 'rotate-180',
          )}
        />
      </button>

      {open && (
        <div
          role="menu"
          className={cn(
            // bg-card is theme-aware (dark in dark mode, white in light) and
            // fully opaque so content behind the menu (e.g. the "+ Add note"
            // button below it) doesn't bleed through.
            'absolute left-0 z-30 min-w-[160px] rounded-lg border border-border bg-card shadow-xl overflow-hidden',
            menuPlacement === 'up' ? 'bottom-full mb-2' : 'top-full mt-2',
          )}
        >
          {STATUS_ORDER.map((opt) => {
            const optMeta = STATUS_META[opt];
            const isActive = opt === status;
            return (
              <button
                key={opt}
                type="button"
                role="menuitem"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setOpen(false);
                  if (opt !== status) onChange?.(opt);
                }}
                className={cn(
                  // foreground/X tints adapt to both themes:
                  //   dark: white-ish overlay on dark card
                  //   light: dark overlay on white card
                  'w-full flex items-center justify-between gap-3 px-3 py-2 text-left text-xs transition-colors cursor-pointer hover:bg-primary/15',
                  isActive && 'bg-foreground/10',
                )}
              >
                <span className="flex items-center gap-2">
                  <span className={cn('w-1.5 h-1.5 rounded-full', optMeta.dotClass)} />
                  <span className="text-foreground">{optMeta.label}</span>
                </span>
                {isActive && <Check className="w-3.5 h-3.5 text-foreground" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
