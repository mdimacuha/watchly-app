import { Sparkles } from 'lucide-react';
import { requireUser } from '@/server/auth/requireUser';
import { getSwipeDeck } from '@/services/swipe';
import { SwipeDeckClient } from '@/components/swipe/SwipeDeckClient';
import { SwipeEmptyState } from '@/components/swipe/SwipeEmptyState';
import { ExperimentalBadge } from '@/components/watchly/ExperimentalBadge';

/**
 * /swipe — WatchlySwipe discovery deck. Server-renders the first page of
 * the deck so the user sees a card on first paint (no spinner round
 * trip). The client component handles state + drag mechanics and
 * fetches more pages as the user runs through the queue.
 */
export default async function SwipePage() {
  const userId = await requireUser();
  const initial = await getSwipeDeck(userId, { limit: 20 });

  return (
    // max-w-4xl (vs 3xl) gives the card stack more room to breathe and
    // matches the larger card max-width set in SwipeDeckClient. The card
    // itself is what should read as the focal point on this page.
    <div className="px-6 py-8 sm:py-10 max-w-4xl mx-auto w-full flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Sparkles size={22} className="text-primary" />
          <h1 className="text-h2">WatchlySwipe</h1>
          <ExperimentalBadge />
        </div>
        <p className="hidden sm:block text-xs text-muted-foreground">
          Drag ← Pass · Drag → Like · S to Save · Enter to Open
        </p>
      </div>
      <p className="text-sm text-muted-foreground -mt-2 sm:hidden">
        Swipe left to Pass · right to Like · tap Save or Details
      </p>

      {initial.items.length === 0 ? (
        <SwipeEmptyState reason="empty-deck" />
      ) : (
        <SwipeDeckClient initialItems={initial.items} />
      )}
    </div>
  );
}
