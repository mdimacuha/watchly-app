'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { Loader2 } from 'lucide-react';
import { ForYouCard } from '@/components/forYou/ForYouCard';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/useToast';
import { getForYouRowAction } from '@/actions/forYou';
import type { ForYouCandidate, ForYouRowId } from '@/services/forYou';

interface ViewAllClientProps {
  rowId: ForYouRowId;
  /** First page, already fetched + rendered on the server. */
  initialItems: ForYouCandidate[];
  /** Whether the server's first page reported more items beyond it. */
  initialHasMore: boolean;
}

/**
 * Client-side "Load more" / infinite-scroll wrapper for a For You row's
 * dedicated View All page. The server renders page 1; this component appends
 * subsequent pages via `getForYouRowAction`, keeping the expensive TMDB
 * enrichment bounded to one page at a time. Shows a visible loading state
 * while fetching and an explicit end-of-list message when there's no more.
 */
export function ViewAllClient({
  rowId,
  initialItems,
  initialHasMore,
}: ViewAllClientProps) {
  const [items, setItems] = useState<ForYouCandidate[]>(initialItems);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [errored, setErrored] = useState(false);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  // Synchronous in-flight guard — `pending` updates asynchronously, so the
  // IntersectionObserver could otherwise fire a second fetch before React
  // re-renders with the disabled state.
  const loadingRef = useRef(false);
  // Dedupe across pages: a shifting candidate pool could in theory surface a
  // title twice, which would break React keys and inflate the grid.
  const seenKeys = useRef(
    new Set(initialItems.map((i) => `${i.mediaType}:${i.tmdbId}`)),
  );

  const loadMore = useCallback(() => {
    if (loadingRef.current || !hasMore) return;
    loadingRef.current = true;
    setErrored(false);
    const nextPage = page + 1;

    startTransition(async () => {
      try {
        const res = await getForYouRowAction({ rowId, page: nextPage });
        setItems((prev) => {
          const fresh = res.items.filter((i) => {
            const key = `${i.mediaType}:${i.tmdbId}`;
            if (seenKeys.current.has(key)) return false;
            seenKeys.current.add(key);
            return true;
          });
          return fresh.length > 0 ? [...prev, ...fresh] : prev;
        });
        setPage(nextPage);
        setHasMore(res.hasMore);
      } catch {
        setErrored(true);
        toast.error("Couldn't load more", 'Please try again.');
      } finally {
        loadingRef.current = false;
      }
    });
  }, [hasMore, page, rowId, toast]);

  // Infinite scroll: auto-load as the sentinel nears the viewport. The Load
  // more button below stays as a keyboard-accessible fallback and is what
  // renders the loading state. Paused after an error so we don't hammer a
  // failing action — the user retries explicitly via the button.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore || errored) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { rootMargin: '400px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, errored, loadMore]);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {items.map((item) => (
          <ForYouCard
            key={`${item.mediaType}:${item.tmdbId}`}
            item={item}
            className="w-full"
          />
        ))}
      </div>

      {hasMore ? (
        <div ref={sentinelRef} className="flex justify-center py-2">
          <Button
            variant="outline"
            onClick={loadMore}
            disabled={pending}
            className="gap-2 min-w-40"
            aria-label="Load more titles"
          >
            {pending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading…
              </>
            ) : errored ? (
              'Retry'
            ) : (
              'Load more'
            )}
          </Button>
        </div>
      ) : (
        <p className="text-center text-xs text-muted-foreground py-4">
          You&apos;ve reached the end of this list.
        </p>
      )}
    </div>
  );
}
