'use client';

import { AlertTriangle, RefreshCw, Search } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

interface SwipeEmptyStateProps {
  /**
   * - `empty-deck`: the recommendation engine returned 0 items on page
   *   load. Usually means the user has burned through everything or has
   *   filtered too aggressively.
   * - `exhausted`: client ran out of items mid-session and a refill found
   *   nothing new.
   * - `error`: a mid-session refill failed.
   */
  reason: 'empty-deck' | 'exhausted' | 'error';
  /**
   * Fetch a fresh deck in place. Required mid-session: the deck keeps its
   * cards in local state, so `router.refresh()` can't refill it. Falls back
   * to a router refresh for the server-rendered `empty-deck` case.
   */
  onRefresh?: () => void;
}

const COPY: Record<SwipeEmptyStateProps['reason'], { title: string; body: string }> = {
  'empty-deck': {
    title: 'No titles to swipe yet',
    body: 'Watchly needs a little signal to recommend titles. Favorite a few movies or shows and your swipe deck will fill up.',
  },
  exhausted: {
    title: "You're all caught up",
    body: "We'll surface fresh picks soon. In the meantime, favorite a few titles or explore your For You feed.",
  },
  error: {
    title: "Couldn't load more picks",
    body: 'Something went wrong fetching your next cards. Try again in a moment.',
  },
};

export function SwipeEmptyState({ reason, onRefresh }: SwipeEmptyStateProps) {
  const router = useRouter();
  const { title, body } = COPY[reason];
  const Icon = reason === 'error' ? AlertTriangle : RefreshCw;

  return (
    <div className="rounded-xl border border-border bg-card p-8 flex flex-col items-center gap-4 text-center">
      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
        <Icon size={20} />
      </div>
      <h2 className="text-h3">{title}</h2>
      <p className="text-sm text-muted-foreground max-w-md">{body}</p>
      <div className="flex gap-2 mt-2">
        <Button
          onClick={onRefresh ?? (() => router.refresh())}
          variant="outline"
          className="gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          {reason === 'error' ? 'Try again' : 'Refresh'}
        </Button>
        <Button asChild>
          <Link href="/search" className="gap-2 inline-flex items-center">
            <Search className="w-4 h-4" />
            Find something
          </Link>
        </Button>
      </div>
    </div>
  );
}
