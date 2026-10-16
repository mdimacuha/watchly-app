'use client';

import { X, Heart, ThumbsUp, Info, ListPlus } from 'lucide-react';
import { cn } from '@/lib/cn';

interface SwipeActionsProps {
  onPass: () => void;
  onLike: () => void;
  onFavorite: () => void;
  onDetails: () => void;
  /** Opens the add-to-watchlist picker for the current card. Distinct from
   *  Favorite/Like — it does NOT advance the deck. */
  onAddToWatchlist: () => void;
  disabled?: boolean;
}

/**
 * Controls beneath the deck. Buttons trigger the same exit animation as
 * the gesture / keyboard shortcut.
 *
 * Row 1 — verdicts (icon buttons):
 *   Pass — destructive · Favorite — primary outline · Like — primary fill
 *   Icons match the rest of Watchly: heart = favorite (it adds to
 *   Favorites), thumbs-up = like (a softer taste signal).
 * Row 2 — secondary, labelled: Details · Add to watchlist. (Undo lives in
 * the reel under the deck.)
 */
export function SwipeActions({
  onPass,
  onLike,
  onFavorite,
  onDetails,
  onAddToWatchlist,
  disabled,
}: SwipeActionsProps) {
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex items-center justify-center gap-4 sm:gap-5">
        <VerdictButton
          onClick={onPass}
          disabled={disabled}
          label="Pass (← or X)"
          className="border-destructive/30 text-destructive hover:bg-destructive/10"
        >
          <X className="w-6 h-6" strokeWidth={2.5} />
        </VerdictButton>
        <VerdictButton
          onClick={onFavorite}
          disabled={disabled}
          label="Favorite (F or S)"
          className="border-primary/40 text-primary hover:bg-primary/10"
          small
        >
          <Heart className="w-5 h-5" strokeWidth={2.5} />
        </VerdictButton>
        <VerdictButton
          onClick={onLike}
          disabled={disabled}
          label="Like (→ or L)"
          className="border-primary text-primary-foreground bg-primary hover:bg-primary/90"
        >
          <ThumbsUp className="w-6 h-6" strokeWidth={2.5} />
        </VerdictButton>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <SecondaryButton onClick={onDetails} disabled={disabled} title="Details (Enter)">
          <Info className="w-4 h-4" />
          Details
        </SecondaryButton>
        {/* Not gated by `disabled` (an in-flight swipe) — it never
            advances the deck and opens its own picker. */}
        <SecondaryButton onClick={onAddToWatchlist} title="Add to watchlist">
          <ListPlus className="w-4 h-4" />
          Add to watchlist
        </SecondaryButton>
      </div>
    </div>
  );
}

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

function VerdictButton({
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
        FOCUS_RING,
        small ? 'w-12 h-12' : 'w-14 h-14',
        className,
      )}
    >
      {children}
    </button>
  );
}

/** Labelled pill, 44px tall (touch target minimum). */
function SecondaryButton({
  onClick,
  disabled,
  title,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        'inline-flex h-11 items-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors cursor-pointer hover:bg-foreground/5',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        FOCUS_RING,
      )}
    >
      {children}
    </button>
  );
}
