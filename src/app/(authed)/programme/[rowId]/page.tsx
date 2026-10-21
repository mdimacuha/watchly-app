import { notFound } from 'next/navigation';
import { getForYouRowAction } from '@/actions/forYou';
import { BackLink } from '@/components/nav/BackLink';
import { EmptyState } from '@/components/watchly/EmptyState';
import { Sparkles } from 'lucide-react';
import type { ForYouRowId } from '@/services/forYou';
import { ViewAllClient } from './ViewAllClient';

// URL slug → row id used by the service.
const SLUG_TO_ROW_ID: Record<string, ForYouRowId> = {
  'from-favorites': 'from_favorites',
  'up-next': 'up_next',
  popular: 'popular_right_now',
  trending: 'trending_this_week',
  'quick-picks': 'quick_picks',
};

// Display titles for the paginated rows. Mirrors the row titles used by the
// home feed so the "View All" page header reads the same as the rail it came
// from. `because_added` is intentionally absent — it has no dedicated page.
const ROW_TITLES: Partial<Record<ForYouRowId, string>> = {
  from_favorites: 'Your Taste',
  up_next: 'Up Next From Your Watchlists',
  popular_right_now: 'Popular Right Now',
  trending_this_week: 'Trending This Week',
  quick_picks: 'Quick Picks',
};

interface PageProps {
  params: Promise<{ rowId: string }>;
}

export default async function ForYouRowPage({ params }: PageProps) {
  const { rowId: slug } = await params;
  const targetId = SLUG_TO_ROW_ID[slug];
  if (!targetId) notFound();

  // Server-render the first page; ViewAllClient appends the rest on demand.
  const firstPage = await getForYouRowAction({ rowId: targetId, page: 1 });
  const title = ROW_TITLES[targetId] ?? "Tonight's Programme";

  return (
    <div className="px-8 py-10 max-w-6xl mx-auto w-full flex flex-col gap-6">
      <BackLink fallbackHref="/programme" label="Back to Tonight's Programme" />

      <header className="flex flex-col gap-1">
        <h1 className="text-h2">{title}</h1>
        <p className="text-sm text-muted-foreground">Full list, ranked.</p>
      </header>

      {firstPage.items.length > 0 ? (
        <ViewAllClient
          rowId={targetId}
          initialItems={firstPage.items}
          initialHasMore={firstPage.hasMore}
        />
      ) : (
        <EmptyState
          icon={Sparkles}
          title="Nothing to show here yet"
          description="Your briefing is still learning. Favorite a few titles or add some to a watchlist to fill this list."
        />
      )}
    </div>
  );
}
