import { History } from 'lucide-react';
import { requireUser } from '@/server/auth/requireUser';
import { getSwipeHistory } from '@/services/swipe';
import { BackLink } from '@/components/nav/BackLink';
import { SwipeHistoryClient } from '@/components/swipe/SwipeHistoryClient';

/**
 * /swipe/history — a log of every title the user has swiped, newest first,
 * with per-action filtering, Quick View, and add-to-watchlist.
 *
 * Self-guarded via requireUser (this path isn't prefix-matched in
 * middleware, mirroring /swipe and /watchlists). Server-renders the first
 * page so the grid paints without a spinner round-trip.
 */
export default async function SwipeHistoryPage() {
  const userId = await requireUser();
  const initial = await getSwipeHistory(userId, { limit: 24 });

  return (
    <div className="px-6 py-8 sm:py-10 max-w-6xl mx-auto w-full flex flex-col gap-6">
      <BackLink fallbackHref="/swipe" label="Back to WatchlySwipe" />

      <div className="flex items-center gap-3">
        <History size={22} className="text-primary" />
        <h1 className="text-h2">Swipe history</h1>
      </div>
      <p className="text-sm text-muted-foreground -mt-2">
        Everything you&apos;ve swiped, newest first. Filter by what you did,
        peek at details, or save a title to a watchlist.
      </p>

      <SwipeHistoryClient initialItems={initial} />
    </div>
  );
}
