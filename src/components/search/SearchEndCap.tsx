'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { buildImageUrl } from '@/lib/tmdb';
import { QuickViewLink } from '@/components/watchly/QuickViewLink';
import { useAuthStore } from '@/client/stores/auth';
import { useRegionStore } from '@/client/stores/region';
import type { ApiResponse } from '@/types/api';
import type { SearchResponse } from '@/types/tmdb';
import type { EndCapResult } from '@/services/search';
import { trackSearch } from '@/client/searchEvents';

const SHOW = 12;

interface SearchEndCapProps {
  query: string;
  data: SearchResponse;
}

/**
 * Shown under search results once they run out. Visually and semantically
 * separate from the results: a divider, a heading about the user (not the
 * query), smaller cards, and a reason per card. Loads after the results via
 * its own request so search latency is unaffected; on failure it simply
 * doesn't render (the search itself worked).
 */
export function SearchEndCap({ query, data }: SearchEndCapProps) {
  const region = useRegionStore((s) => s.regionCode);
  const isSignedIn = useAuthStore((s) => s.status === 'authenticated');
  const [result, setResult] = useState<EndCapResult | null>(null);
  const [failed, setFailed] = useState(false);

  // What the search is "about": its most common genres across title matches
  // and theme results. Lets the picks lean on-topic.
  const genres = useMemo(() => {
    const counts = new Map<number, number>();
    for (const item of [...data.results, ...(data.related?.items ?? [])]) {
      for (const g of item.genreIds ?? []) counts.set(g, (counts.get(g) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([g]) => g);
  }, [data]);

  // Titles already on screen shouldn't be "suggested" again.
  const shownKeys = useMemo(
    () =>
      new Set([
        ...data.results.map((r) => `${r.mediaType}:${r.id}`),
        ...(data.related?.items ?? []).map((r) => `${r.mediaType}:${r.id}`),
      ]),
    [data],
  );

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams();
    if (genres.length) params.set('genres', genres.join(','));
    if (region) params.set('region', region);
    fetch(`/api/v1/search/end-cap?${params.toString()}`, { signal: controller.signal })
      .then(async (res) => {
        const json = (await res.json()) as ApiResponse<EndCapResult>;
        if (!res.ok || !json.success || !json.data) throw new Error('end-cap failed');
        setResult(json.data);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [genres, region, isSignedIn]);

  const visibleCount = (result?.items ?? []).filter(
    (i) => !shownKeys.has(`${i.mediaType}:${i.id}`),
  ).length;
  // One "shown" event per loaded end-cap (search_events).
  useEffect(() => {
    if (!result) return;
    trackSearch('endcap_shown', query, {
      mode: result.mode,
      count: Math.min(visibleCount, SHOW),
      genres,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  if (failed) return null;
  const items = (result?.items ?? [])
    .filter((i) => !shownKeys.has(`${i.mediaType}:${i.id}`))
    .slice(0, SHOW);
  if (result && items.length === 0) return null;

  const taste = result?.mode === 'taste';

  return (
    <section
      aria-labelledby="search-endcap-heading"
      aria-busy={!result}
      className="mt-12 border-t border-border pt-10"
    >
      <p className="text-sm text-muted-foreground">That&apos;s all for “{query}”.</p>
      <div className="mt-1 mb-5 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 id="search-endcap-heading" className="text-h3">
          {result && !taste ? 'Popular right now' : 'Picked for you instead'}
        </h2>
        {result && !taste && !isSignedIn && (
          <Link href="/signin" className="text-sm text-muted-foreground hover:text-foreground underline-offset-2 hover:underline">
            Sign in for picks tuned to your taste
          </Link>
        )}
        {taste && (
          <Link
            href="/programme"
            className="ml-auto inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            More in Tonight&apos;s Programme <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
        {result
          ? items.map((item, i) => {
              const poster = buildImageUrl(item.posterPath, 'w185');
              return (
                <QuickViewLink
                  key={`${item.mediaType}:${item.id}`}
                  mediaType={item.mediaType}
                  titleId={item.id}
                  aria-label={item.reason ? `${item.title}. ${item.reason}` : item.title}
                  onClick={() =>
                    trackSearch('result_opened', query, {
                      section: 'endcap',
                      mode: result.mode,
                      mediaType: item.mediaType,
                      id: item.id,
                      position: i + 1,
                    })
                  }
                  className="group flex flex-col gap-1.5"
                >
                  <div className="relative aspect-2/3 w-full overflow-hidden rounded-md bg-muted">
                    {poster && (
                      <Image
                        src={poster}
                        alt=""
                        fill
                        sizes="(max-width: 768px) 33vw, 15vw"
                        className="object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    )}
                  </div>
                  <span className="truncate text-xs font-medium text-foreground">{item.title}</span>
                  {item.reason && (
                    <span className="-mt-1 truncate text-[11px] text-muted-foreground">{item.reason}</span>
                  )}
                </QuickViewLink>
              );
            })
          : Array.from({ length: 6 }).map((_, i) => (
              <div key={i} aria-hidden className="aspect-2/3 w-full rounded-md bg-secondary motion-safe:animate-pulse" />
            ))}
      </div>
    </section>
  );
}
