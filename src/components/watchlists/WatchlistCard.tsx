'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useState, type MouseEvent } from 'react';
import { ArrowBigUp, Bookmark } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/cn';
import { formatRelativeAgo } from '@/lib/format';
import { useToast } from '@/hooks/useToast';
import { FEATURES } from '@/constants/features';
import {
  getWatchlistVoteStateAction,
  toggleWatchlistUpvoteAction,
} from '@/actions/watchlists';
import type { WatchlistWithCount } from '@/services/watchlists';

const TMDB_POSTER_BASE = 'https://image.tmdb.org/t/p/w342';

interface WatchlistCardProps {
  watchlist: WatchlistWithCount;
}

export function WatchlistCard({ watchlist }: WatchlistCardProps) {
  const posters = watchlist.posterPaths.slice(0, 3);

  return (
    <div className="group relative block h-full">
      {/* Upvote pill is a sibling of the Link (not nested inside the anchor),
          matching the card overlay pattern used elsewhere. Only rendered when
          the feature is on and the list is public. */}
      {FEATURES.watchlistUpvoting && watchlist.isPublic && (
        <div className="absolute top-3 right-3 z-10">
          <CardUpvoteButton watchlistId={watchlist.id} />
        </div>
      )}
      <Link
        href={`/watchlists/${watchlist.id}`}
        className="block h-full"
      >
        <Card className="overflow-hidden hover:border-primary/50 transition-colors h-full flex flex-col">
          {/* Poster collage */}
          <div className="flex items-end justify-center gap-2 px-4 pt-4 pb-3 min-h-[170px]">
            {posters.length === 0 ? (
              <div className="flex items-center justify-center h-[150px] w-full">
                <Bookmark className="w-10 h-10 text-muted-foreground/30" />
              </div>
            ) : (
              posters.map((path, i) => (
                <div
                  key={i}
                  className={cn(
                    'relative flex-1 max-w-[110px] aspect-2/3 rounded-md overflow-hidden bg-muted',
                    'shadow-lg shadow-black/40',
                  )}
                >
                  <Image
                    src={`${TMDB_POSTER_BASE}${path}`}
                    alt=""
                    fill
                    sizes="(max-width: 768px) 33vw, 120px"
                    className="object-cover"
                  />
                </div>
              ))
            )}
          </div>

          {/* Meta — pushed to the bottom so cards in the same grid row line up. */}
          <div className="px-4 pb-4 pt-1 flex flex-col gap-1 mt-auto">
            <h3 className="text-base font-semibold text-foreground line-clamp-1 group-hover:text-primary transition-colors">
              {watchlist.name}
            </h3>
            <span className="text-xs text-muted-foreground">
              {watchlist.itemCount}{' '}
              {watchlist.itemCount === 1 ? 'item' : 'items'}
              {' · '}
              Updated {formatRelativeAgo(watchlist.updatedAt)}
            </span>
          </div>
        </Card>
      </Link>
    </div>
  );
}

/**
 * Compact upvote pill overlaid on the card. Rendered as a sibling of the card
 * `<Link>` (not nested inside the anchor), but still calls preventDefault +
 * stopPropagation so a click never bubbles into card navigation. Only mounted
 * when `FEATURES.watchlistUpvoting` is on, so an un-migrated table is never
 * queried. Optimistic toggle, reverts on error.
 */
function CardUpvoteButton({ watchlistId }: { watchlistId: string }) {
  const toast = useToast();
  const [state, setState] = useState<{ count: number; hasVoted: boolean } | null>(
    null,
  );
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let active = true;
    getWatchlistVoteStateAction(watchlistId)
      .then((s) => {
        if (active) setState(s);
      })
      .catch(() => {
        // Leave hidden on failure rather than showing a misleading zero.
      });
    return () => {
      active = false;
    };
  }, [watchlistId]);

  if (!state) return null;

  const toggle = async (e: MouseEvent) => {
    // The pill sits inside the card's Link — don't navigate on click.
    e.preventDefault();
    e.stopPropagation();
    if (pending) return;

    const previous = state;
    setState({
      count: state.hasVoted ? state.count - 1 : state.count + 1,
      hasVoted: !state.hasVoted,
    });
    setPending(true);
    try {
      const result = await toggleWatchlistUpvoteAction(watchlistId);
      setState({ count: result.count, hasVoted: result.upvoted });
    } catch {
      setState(previous);
      toast.error('Could not update upvote', 'Please try again.');
    } finally {
      setPending(false);
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={state.hasVoted}
      aria-label={state.hasVoted ? 'Remove upvote' : 'Upvote this watchlist'}
      className={cn(
        'inline-flex w-fit items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium transition-colors cursor-pointer',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        state.hasVoted
          ? 'border-primary/50 text-primary'
          : 'border-border text-muted-foreground hover:text-foreground',
      )}
    >
      <ArrowBigUp
        className={cn('w-3.5 h-3.5', state.hasVoted && 'fill-primary')}
      />
      <span className="tabular-nums">{state.count}</span>
    </button>
  );
}
