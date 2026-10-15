'use client';

import { cn } from '@/lib/cn';
import type { SearchResponse } from '@/types/tmdb';
import { TmdbGridItem } from './TmdbGridItem';
import { Pagination } from './Pagination';
import { useSearchParams } from 'next/navigation';
import { PosterCardSkeleton, SkeletonBox } from '@/components/watchly/skeletons';
import { AlertCircle } from 'lucide-react';

interface SearchResultsGridProps {
  data: SearchResponse | null;
  /** A request is currently in flight. */
  isFetching: boolean;
  /** Settled error message, if the last request failed. */
  error?: string | null;
  className?: string;
  regionName?: string;
}

// Matches the route-level search/loading.tsx grid exactly so there's no
// layout shift between the initial skeleton and the loaded results.
const GRID_CLASS =
  'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 w-full';

export function SearchResultsGrid({
  data,
  isFetching,
  error,
  className,
  regionName = 'your region',
}: SearchResultsGridProps) {
  const searchParams = useSearchParams();
  const query = searchParams.get('q');

  const title = query ? 'Search Results' : `Popular in ${regionName}`;
  const totalResults =
    query && data ? `${data.total_results.toLocaleString()} results found` : '';

  const hasResults = !!data && data.results.length > 0;

  // Error state — replaces the misleading "No results found" on failure.
  if (error) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center gap-3 py-20 text-center',
          className,
        )}
        role="alert"
      >
        <AlertCircle className="h-8 w-8 text-destructive" aria-hidden="true" />
        <div className="space-y-1">
          <p className="text-foreground font-medium">
            We couldn&apos;t load results
          </p>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  // First load (or a refetch with nothing to dim yet): show the poster-grid
  // skeleton. Once we have results to show, we dim them instead (below).
  if (isFetching && !hasResults) {
    return (
      <div className={cn('space-y-6', className)}>
        <SkeletonBox className="h-7 w-48" />
        <div className={GRID_CLASS} aria-hidden="true">
          {Array.from({ length: 12 }).map((_, i) => (
            <PosterCardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  // Settled with no results — a genuine empty state (not a failure).
  // (Written as an explicit null/length check so `data` narrows to non-null
  // for the success branch below.)
  if (!data || data.results.length === 0) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center py-20 text-muted-foreground',
          className,
        )}
      >
        <p>
          {query ? `No results found for “${query}”` : 'No results found'}
        </p>
      </div>
    );
  }

  return (
    <div className={cn('space-y-6', className)}>
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        <span className="text-sm text-muted-foreground">{totalResults}</span>
      </div>

      {/* Refetching: dim the current results instead of blanking them. */}
      <div
        className={cn(
          GRID_CLASS,
          'transition-opacity duration-200',
          isFetching && 'opacity-50',
        )}
        aria-busy={isFetching}
      >
        {data.results.map(item => (
          <TmdbGridItem key={`${item.mediaType}-${item.id}`} item={item} />
        ))}
      </div>

      <div className="flex justify-center pt-8 pb-12">
        <Pagination currentPage={data.page} totalPages={data.total_pages} />
      </div>
    </div>
  );
}
