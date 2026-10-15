'use client';

import { X, Heart, Bookmark, Info, ListPlus } from 'lucide-react';
import { cn } from '@/lib/cn';

interface SwipeActionsProps {
  onPass: () => void;
  onLike: () => void;
  onSave: () => void;
  onDetails: () => void;
  /** Opens the add-to-watchlist picker for the current card. Distinct from
   *  Save/Like — it does NOT advance the deck. */
  onAddToWatchlist: () => void;
  disabled?: boolean;
}

/**
 * Action row beneath the deck. Tapping a button does the same thing as
 * the corresponding gesture / keyboard shortcut — useful on desktop and
 * as a fallback when drag feels awkward.
 *
 * Color cue per action:
 *   Pass — destructive (red)
 *   Like — soft (neutral fill)
 *   Save — primary (brand indigo)
 *   Details — ghost
 *   Add to watchlist — ghost (separate from Like/Save/Pass; never advances)
 */
export function SwipeActions({
  onPass,
  onLike,
  onSave,
  onDetails,
  onAddToWatchlist,
  disabled,
}: SwipeActionsProps) {
  return (
    <div className="flex items-center justify-center gap-3 sm:gap-4">
      <ActionButton
        onClick={onPass}
        disabled={disabled}
        label="Pass (← or X)"
        className="border-destructive/30 text-destructive hover:bg-destructive/10"
      >
        <X className="w-6 h-6" strokeWidth={2.5} />
      </ActionButton>
      <ActionButton
        onClick={onDetails}
        disabled={disabled}
        label="Details (Enter)"
        className="border-border text-foreground hover:bg-foreground/5"
        small
      >
        <Info className="w-5 h-5" />
      </ActionButton>
      {/* Add to watchlist — intentionally NOT gated by `disabled` (which
          tracks an in-flight swipe commit) since it never advances the deck,
          and opens its own picker. */}
      <ActionButton
        onClick={onAddToWatchlist}
        label="Add to watchlist"
        className="border-border text-foreground hover:bg-foreground/5"
        small
      >
        <ListPlus className="w-5 h-5" />
      </ActionButton>
      <ActionButton
        onClick={onSave}
        disabled={disabled}
        label="Save (S)"
        className="border-primary/30 text-primary hover:bg-primary/10"
        small
      >
        <Bookmark className="w-5 h-5" strokeWidth={2.5} />
      </ActionButton>
      <ActionButton
        onClick={onLike}
        disabled={disabled}
        label="Like (→ or L)"
        className="border-primary text-primary-foreground bg-primary hover:bg-primary/90"
      >
        <Heart className="w-6 h-6" strokeWidth={2.5} />
      </ActionButton>
    </div>
  );
}

function ActionButton({
  onClick,
  disabled,
  label,
  className,
  small,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  label: string;
  className?: string;
  small?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        'rounded-full border-2 flex items-center justify-center transition-colors cursor-pointer',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        small ? 'w-12 h-12' : 'w-14 h-14',
        className,
      )}
    >
      {children}
    </button>
  );
}
