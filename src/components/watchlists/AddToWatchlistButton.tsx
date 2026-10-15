'use client';

import { useEffect, useState } from 'react';
import { Plus, Bookmark, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import type { WatchlistMediaType } from '@/services/watchlists';
import { isInAnyWatchlistAction } from '@/actions/watchlists';
import { AddToWatchlistPicker } from './AddToWatchlistPicker';

interface AddToWatchlistButtonProps {
  mediaType: WatchlistMediaType;
  mediaId: string;
  /** Optional title used for modal header context, e.g. Add "{title}" to a list. */
  title?: string;
  /** 'default' = full labelled button; 'icon' = compact square icon button for cards/swipe. */
  variant?: 'default' | 'icon';
  /** Seeds the "Added to Watchlist" state (title is already in ≥1 of the user's lists). */
  initialInList?: boolean;
  /**
   * When true, self-fetch membership on mount instead of relying on
   * `initialInList`. Used on ISR-cached pages where the server can't pass
   * per-user state. Leave false on server-rendered lists that already seed it.
   */
  fetchInitial?: boolean;
  className?: string;
}

export function AddToWatchlistButton({
  mediaType,
  mediaId,
  title,
  variant = 'default',
  initialInList = false,
  fetchInitial = false,
  className,
}: AddToWatchlistButtonProps) {
  const [isPickerOpen, setPickerOpen] = useState(false);
  // Whether this title is in at least one of the user's watchlists. Seeded from
  // the server (or self-fetched when `fetchInitial`); the picker reports back
  // when membership changes (add-only, so it can only flip false→true here —
  // removals happen on the watchlist page).
  const [inList, setInList] = useState(initialInList);

  useEffect(() => {
    if (!fetchInitial) return;
    let cancelled = false;
    isInAnyWatchlistAction(mediaType, mediaId)
      .then((v) => {
        if (!cancelled) setInList(v);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [fetchInitial, mediaType, mediaId]);

  // Open the picker immediately — no pre-flight await. The picker renders its
  // own skeleton while it loads the user's lists, then routes to the empty
  // state (0 lists) or the multi-select + Confirm flow (1+ lists). Opening
  // straight to the modal also removes the single-list silent direct-add
  // (and the phantom-list bug that came with it).
  const handleClick = (e: React.MouseEvent) => {
    // Keep the click from triggering a surrounding card <Link> (the icon
    // variant is rendered inside cards / the swipe deck).
    e.preventDefault();
    e.stopPropagation();
    setPickerOpen(true);
  };

  return (
    <>
      {variant === 'icon' ? (
        <Button
          type="button"
          variant="secondary"
          size="icon"
          onClick={handleClick}
          aria-label={inList ? 'In a watchlist — manage' : 'Add to watchlist'}
          title={inList ? 'In a watchlist' : 'Add to watchlist'}
          className={className}
        >
          <Bookmark className={cn('w-5 h-5', inList && 'fill-current')} />
        </Button>
      ) : (
        <Button
          type="button"
          variant={inList ? 'secondary' : 'default'}
          onClick={handleClick}
          className={cn('gap-2', className)}
        >
          {inList ? (
            <Check className="w-4 h-4" />
          ) : (
            <Plus className="w-4 h-4" />
          )}
          <span>{inList ? 'Added to Watchlist' : 'Add to Watchlist'}</span>
        </Button>
      )}
      <AddToWatchlistPicker
        isOpen={isPickerOpen}
        onClose={() => setPickerOpen(false)}
        mediaType={mediaType}
        mediaId={mediaId}
        title={title}
        onMembershipChange={setInList}
      />
    </>
  );
}
