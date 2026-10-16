import Link from 'next/link';
import { Sparkles, Search, Bookmark, ArrowLeftRight } from 'lucide-react';
import { getForYouFeedAction, getForYouPoolAction } from '@/actions/forYou';
import { ForYouMain } from "@/components/forYou/ForYouPrototype";
import { ForYouHero } from '@/components/forYou/ForYouHero';
import { ForYouRow } from '@/components/forYou/ForYouRow';
import { PreferencesButton } from '@/components/forYou/PreferencesButton';
import {
  ForYouFilterableRow,
  FAVORITES_CHIPS,
  QUICK_PICKS_CHIPS,
} from '@/components/forYou/ForYouFilterableRow';
import { EmptyState } from '@/components/watchly/EmptyState';
import { Button } from '@/components/ui/button';
import type { ForYouRowId } from '@/services/forYou';
import { requireUser } from '@/server/auth/requireUser';

// Maps row IDs to their dedicated "View All" pages. `because_added` is
// excluded because each per-seed row is unique to the seed and doesn't have
// a stable URL.
const VIEW_ALL_HREFS: Partial<Record<ForYouRowId, string>> = {
  from_favorites: '/for-you/from-favorites',
  up_next: '/for-you/up-next',
  popular_right_now: '/for-you/popular',
  trending_this_week: '/for-you/trending',
  quick_picks: '/for-you/quick-picks',
};

export default async function ForYouPage() {
  // Validates the session against the DB so a stale cookie redirects to
  // /signin cleanly instead of crashing inside the feed action.
  await requireUser();

  // PROTOTYPE: the Programme + Dial on the shared pool (round 2), dev
  // builds only. Production keeps the current page until a winner is picked.
  if (process.env.NODE_ENV !== 'production') {
    const pool = await getForYouPoolAction();
    return (
      <div className="px-4 sm:px-8 py-10 max-w-6xl mx-auto w-full">
        <ForYouMain pool={pool} />
      </div>
    );
  }

  const feed = await getForYouFeedAction();

  const hasContent = feed.hero !== null || feed.rows.length > 0;

  return (
    <div className="px-8 py-10 max-w-6xl mx-auto w-full flex flex-col gap-8">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <Sparkles size={24} className="text-primary" />
            <h1 className="text-h2">Tonight&apos;s Briefing</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Picked from your favorites, watchlists and swipes.
          </p>
        </div>
        <PreferencesButton />
      </header>

      {hasContent ? (
        <>
          {feed.hero && <ForYouHero initialHero={feed.hero} />}
          {feed.rows.map((row) => {
            const viewAllHref = VIEW_ALL_HREFS[row.id];

            // Rows that use client-side filter chips.
            if (row.id === 'from_favorites') {
              return (
                <ForYouFilterableRow
                  key={row.id}
                  row={row}
                  chips={FAVORITES_CHIPS}
                  viewAllHref={viewAllHref}
                />
              );
            }
            if (row.id === 'quick_picks') {
              return (
                <ForYouFilterableRow
                  key={row.id}
                  row={row}
                  chips={QUICK_PICKS_CHIPS}
                  viewAllHref={viewAllHref}
                />
              );
            }

            // Per-seed "Because You Added" rows share an id, so distinguish
            // by title to avoid React key collisions.
            const key =
              row.id === 'because_added' ? `${row.id}:${row.title}` : row.id;
            return <ForYouRow key={key} row={row} viewAllHref={viewAllHref} />;
          })}
        </>
      ) : (
        <EmptyState
          icon={Sparkles}
          title="Your briefing is still learning"
          description="Favorite a few titles or hop into WatchlySwipe and start swiping — both teach Watchly what to surface here."
          action={
            <div className="flex gap-3 flex-wrap justify-center">
              <Link href="/swipe">
                <Button className="gap-2">
                  <ArrowLeftRight className="w-4 h-4" />
                  Try WatchlySwipe
                </Button>
              </Link>
              <Link href="/search">
                <Button variant="outline" className="gap-2">
                  <Search className="w-4 h-4" />
                  Browse search
                </Button>
              </Link>
              <Link href="/watchlists">
                <Button variant="outline" className="gap-2">
                  <Bookmark className="w-4 h-4" />
                  Your watchlists
                </Button>
              </Link>
            </div>
          }
        />
      )}
    </div>
  );
}
