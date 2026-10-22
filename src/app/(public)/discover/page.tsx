import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SearchPageClient } from '@/components/search/SearchPageClient';

// Arbitrary `?q=` result pages are thin/duplicate — keep them out of the index
// (the shell still renders and links are followed).
export const metadata: Metadata = {
  title: 'Discover',
  description: 'Search movies and TV shows and find where to stream them.',
  robots: { index: false, follow: true },
};

export default function DiscoverPage() {
  return (
    <Suspense
      fallback={<div className="p-8 text-center">Loading search...</div>}
    >
      <SearchPageClient />
    </Suspense>
  );
}
