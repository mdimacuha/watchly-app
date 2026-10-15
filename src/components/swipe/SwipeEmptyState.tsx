'use client';

import { RefreshCw, Search } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

interface SwipeEmptyStateProps {
  /**
   * - `empty-deck`: the recommendation engine returned 0 items.
   *   Usually means the user has burned through everything or has
   *   filtered too aggressively.
   * - `exhausted`: client ran out of items mid-session.
   */
  reason: 'empty-deck' | 'exhausted';
}

export function SwipeEmptyState({ reason }: SwipeEmptyStateProps) {
  const router = useRouter();
  const isExhausted = reason === 'exhausted';

  return (
    <div className="rounded-xl border border-border bg-card p-8 flex flex-col items-center gap-4 text-center">
      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
        <RefreshCw size={20} />
      </div>
      <h2 className="text-h3">
        {isExhausted ? "You're all caught up" : 'No titles to swipe yet'}
      </h2>
      <p className="text-sm text-muted-foreground max-w-md">
        {isExhausted
          ? "We'll surface fresh picks soon. In the meantime, favorite a few titles or explore your For You feed."
          : 'Watchly needs a little signal to recommend titles. Favorite a few movies or shows and your swipe deck will fill up.'}
      </p>
      <div className="flex gap-2 mt-2">
        <Button onClick={() => router.refresh()} variant="outline" className="gap-2">
          <RefreshCw className="w-4 h-4" />
          Refresh
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
