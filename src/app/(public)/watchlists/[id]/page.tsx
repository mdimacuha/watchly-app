import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getEnrichedWatchlistAction } from '@/actions/watchlists';
import { WatchlistDetailClient } from '@/components/watchlists/WatchlistDetailClient';
import { AccentScope } from '@/components/profile/AccentScope';
import { normalizeAccentColor } from '@/constants/accentColors';

// Viewer-gated (public/private) + noindex: must render per-request and never be
// statically cached. Explicit now that the (public) layout no longer forces it
// dynamic — also keeps WatchlistDetailClient's useSearchParams out of static
// prerender (CSR bailout).
export const dynamic = 'force-dynamic';

// Fetch-free: watchlists are noindex (a private list must never leak into the
// index, and the page already enforces public/private server-side). This gives
// shared links a clean preview without doubling the page's DB read. To upgrade
// to a per-list card (name + poster collage), fetch getWatchlist(id) here and a
// dedicated opengraph-image.tsx — see docs/seo-implementation.md.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return {
    title: 'Watchlist',
    description:
      'A shared watchlist on Watchly — see the movies and TV shows in it and where to stream them.',
    alternates: { canonical: `/watchlists/${id}` },
    robots: { index: false, follow: true },
    openGraph: {
      type: 'website',
      title: 'A watchlist on Watchly',
      description:
        'See the movies and TV shows in this watchlist and where to stream them.',
      url: `/watchlists/${id}`,
    },
  };
}


interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function WatchlistDetailPage({ params }: PageProps) {
  const { id } = await params;

  // Resolve data outside JSX so a fetch failure can call notFound() without
  // the lint rule flagging JSX-in-try/catch (errors from rendering wouldn't
  // be caught here anyway — only the data-fetch needs the guard).
  let payload;
  try {
    payload = await getEnrichedWatchlistAction(id);
  } catch {
    notFound();
  }

  const { watchlist, items, isOwner, owner } = payload;
  return (
    <AccentScope
      accentColor={normalizeAccentColor(owner.accentColor)}
      className="px-4 sm:px-8 py-10 max-w-6xl mx-auto w-full"
    >
      <WatchlistDetailClient
        watchlist={watchlist}
        items={items}
        isOwner={isOwner}
        owner={owner}
      />
    </AccentScope>
  );
}
