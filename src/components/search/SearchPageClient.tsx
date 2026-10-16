'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { SearchField } from './SearchField';
import { FilterPills } from './FilterPills';
import { FilterDropdowns } from './FilterDropdowns';
import { ActiveFilterChips } from './ActiveFilterChips';
import { SearchResults } from './SearchResults';
import { trackSearch } from '@/client/searchEvents';
import type { SearchResponse } from '@/types/tmdb';
import { useRegionStore } from '@/client/stores/region';
import { RegionToggle } from '@/components/region/RegionToggle';
import { useToast } from '@/hooks/useToast';

export function SearchPageClient() {
  const searchParams = useSearchParams();
  const { regionName, regionCode } = useRegionStore();

  const [data, setData] = useState<SearchResponse | null>(null);
  const [isFetching, setIsFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // useToast() returns a fresh object each render — keep it in a ref so the
  // fetch effect below doesn't re-run (and refetch) on every render.
  const toast = useToast();
  const toastRef = useRef(toast);
  // Keep the ref current in an effect (assigning during render trips the
  // compiler's "refs during render" rule) without re-running the fetch effect.
  useEffect(() => {
    toastRef.current = toast;
  });

  // Sync with URL params. An AbortController cancels any in-flight request
  // when the query/region changes so stale responses can't land out of order.
  useEffect(() => {
    const controller = new AbortController();

    const fetchResults = async () => {
      setIsFetching(true);
      setError(null);
      const startedAt = performance.now();
      try {
        const query = new URLSearchParams(searchParams);

        // Pass the region from the store if it exists.
        if (regionCode) {
          query.set('region', regionCode);
        }

        const res = await fetch(`/api/v1/tmdb/search?${query.toString()}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`Search failed (${res.status})`);
        const json: SearchResponse = await res.json();
        setData(json);
        setIsFetching(false);

        // Settled text searches only (the URL updates after the debounce, so
        // this is one event per settled query/page, not per keystroke).
        const q = searchParams.get('q')?.trim();
        if (q) {
          trackSearch('search_performed', q, {
            page: json.page,
            type: searchParams.get('type') ?? 'all',
            filters: {
              genre: searchParams.get('genre'),
              year: searchParams.get('year'),
              service: searchParams.get('service'),
            },
            titles: json.results.length,
            totalResults: json.total_results,
            people: json.people?.length ?? 0,
            relatedKeyword: json.related?.keyword.name ?? null,
            relatedCount: json.related?.items.length ?? 0,
            zeroResults:
              json.results.length === 0 && !json.people?.length && !json.related,
            latencyMs: Math.round(performance.now() - startedAt),
          });
        }
      } catch {
        // A stale/aborted request was superseded — leave state to the newer one.
        if (controller.signal.aborted) return;

        const message =
          'Something went wrong while searching. Please try again.';
        setError(message);
        setIsFetching(false);
        toastRef.current.error('Search failed', message);
      }
    };

    fetchResults();

    return () => controller.abort();
  }, [searchParams, regionCode]);

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground p-6 space-y-6 max-w-7xl mx-auto w-full">
      {/* Header Section */}
      <div className="flex flex-col space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-h1">Search</h1>
          <RegionToggle />
        </div>

        {/* Search Bar */}
        <SearchField
          fetching={isFetching}
          suggestionsData={data}
        />

        {/* Filters */}
        <div className="w-full">
          <div className="flex items-center gap-4 overflow-x-auto no-scrollbar pb-2 -mx-6 px-6 xl:mx-0 xl:px-0 xl:overflow-visible xl:mask-none xl:pb-0 xl:justify-between">
            <FilterPills className="shrink-0" />
            <FilterDropdowns className="shrink-0 flex-nowrap xl:flex-wrap" />
          </div>
        </div>

        {/* Active filter chips (removable) + clear-all */}
        <ActiveFilterChips />
      </div>

      {/* Results Grid */}
      <SearchResults
        data={data}
        isFetching={isFetching}
        error={error}
        regionName={regionName}
      />
    </div>
  );
}
