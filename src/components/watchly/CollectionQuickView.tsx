'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowUpRight, Share2, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { buildImageUrl } from '@/lib/tmdb';
import { formatRuntime } from '@/lib/format';
import { shareTitle } from '@/lib/share';
import { useAuthStore } from '@/client/stores/auth';
import { ErrorState } from '@/components/watchly/ErrorState';
import { SkeletonBox } from '@/components/watchly/skeletons';
import { QuickViewLink } from '@/components/watchly/QuickViewLink';
import { FavoriteButton } from '@/components/watchly/FavoriteButton';
import { AddCollectionToWatchlistButton } from '@/components/watchlists/AddCollectionToWatchlistButton';
import { OUTLINE_BTN } from '@/components/title/titleParts';
import type { CollectionQuickViewPayload } from '@/services/tmdb/collection';
import type { ApiResponse } from '@/types/api';

interface CollectionQuickViewContentProps {
  id: string;
  onClose: () => void;
  closeButton: ReactNode;
}

/**
 * Collection (franchise) variant of the Quick View popup: backdrop, poster,
 * films in release order with year / runtime / rating, and the total
 * runtime. Clicking a film swaps the popup to that title's Quick View.
 * Laid out like the title variant so the two read as one component.
 */
export function CollectionQuickViewContent({ id, onClose, closeButton }: CollectionQuickViewContentProps) {
  const isAuthenticated = useAuthStore((s) => s.status === 'authenticated');
  const [data, setData] = useState<CollectionQuickViewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    // Keyed by collection id in the modal, so a fresh open starts loading=true.
    const controller = new AbortController();
    fetch(`/api/v1/collections/${id}/quick`, { signal: controller.signal })
      .then(async (res) => {
        const json = (await res.json()) as ApiResponse<CollectionQuickViewPayload>;
        if (!res.ok || !json.success || !json.data) throw new Error('Failed to load collection');
        setData(json.data);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [id, nonce]);

  if (loading) {
    return (
      <div className="relative">
        {closeButton}
        <SkeletonBox className="aspect-[16/7] w-full rounded-none" />
        <div className="p-5 sm:p-6 flex flex-col gap-5">
          <div className="flex gap-4">
            <SkeletonBox className="-mt-16 w-24 sm:w-28 shrink-0 aspect-[2/3] rounded-lg" />
            <div className="flex-1 min-w-0 flex flex-col gap-3 pt-1">
              <SkeletonBox className="h-6 w-2/3" />
              <SkeletonBox className="h-4 w-1/3" />
            </div>
          </div>
          <SkeletonBox className="h-48 w-full" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="relative">
        {closeButton}
        <ErrorState
          title="Couldn't load this collection"
          description="Something went wrong. Please try again."
          action={
            <Button
              variant="secondary"
              onClick={() => {
                setError(false);
                setLoading(true);
                setNonce((n) => n + 1);
              }}
            >
              Try again
            </Button>
          }
        />
      </div>
    );
  }

  const posterUrl = buildImageUrl(data.posterPath, 'w342');
  const backdropUrl = buildImageUrl(data.backdropPath, 'w780');
  const total = formatRuntime(data.totalRuntimeMinutes);
  const kicker = ['Collection', `${data.parts.length} ${data.parts.length === 1 ? 'film' : 'films'}`, data.yearSpan]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="relative">
      {closeButton}

      <div className="relative w-full aspect-[16/7] bg-card overflow-hidden">
        {backdropUrl && (
          <Image src={backdropUrl} alt="" fill className="object-cover object-top opacity-60" sizes="(max-width: 640px) 100vw, 672px" />
        )}
        <div className="absolute inset-0 bg-linear-to-b from-background/10 via-background/50 to-background" />
      </div>

      <div className="p-5 sm:p-6 flex flex-col gap-5">
        <div className="flex gap-4 sm:gap-5">
          {posterUrl && (
            <div className="relative -mt-20 w-24 sm:w-32 shrink-0 self-start aspect-[2/3] rounded-md overflow-hidden border border-foreground/10 shadow-elevation-card bg-card">
              <Image src={posterUrl} alt={`${data.name} poster`} fill className="object-cover" sizes="128px" />
            </div>
          )}
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            <p className="type-kicker text-muted-foreground">{kicker}</p>
            <h2 className="text-3xl font-bold leading-[1.05] tracking-tight text-foreground text-balance">{data.name}</h2>
            {total && <p className="text-sm text-muted-foreground">{total} to watch them all</p>}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isAuthenticated && (
            <>
              <AddCollectionToWatchlistButton collectionId={String(data.id)} collectionName={data.name} />
              {/* FavoriteButton ignores className; style it from the wrapper. */}
              <div className="[&_button]:h-10 [&_button]:w-10 [&_button]:border [&_button]:border-border [&_button]:bg-transparent [&_button:hover]:bg-secondary/60">
                <FavoriteButton id={data.id} type="collection" showText={false} fetchInitial />
              </div>
            </>
          )}
          <Button
            variant="secondary"
            size="icon"
            onClick={() => shareTitle('co', data.id, data.name)}
            aria-label="Share"
            className={`${OUTLINE_BTN} w-10 px-0`}
          >
            <Share2 className="w-4 h-4" />
          </Button>
          {/* The popup is global (store-driven), so close it on navigate. */}
          <Button asChild variant="secondary" className={`${OUTLINE_BTN} ml-auto`}>
            <Link href={`/collection/${data.id}`} onClick={onClose}>
              <ArrowUpRight className="w-4 h-4" />
              <span>Go to page</span>
            </Link>
          </Button>
        </div>

        {data.overview && (
          <p className="text-sm leading-relaxed text-muted-foreground line-clamp-4">{data.overview}</p>
        )}

        {data.parts.length > 0 && (
          <section aria-labelledby="collection-films" className="flex flex-col gap-1">
            <h3 id="collection-films" className="type-kicker text-muted-foreground mb-1">In release order</h3>
            <ol className="flex flex-col divide-y divide-border border-y border-border">
              {data.parts.map((part, i) => {
                const poster = buildImageUrl(part.posterPath, 'w92');
                const runtime = formatRuntime(part.runtimeMinutes);
                return (
                  <li key={part.id}>
                    <QuickViewLink
                      mediaType="movie"
                      titleId={part.id}
                      className="group flex items-center gap-3 py-2.5 -mx-2 px-2 rounded-md hover:bg-foreground/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="w-5 shrink-0 font-mono text-xs tabular-nums text-muted-foreground">{i + 1}</span>
                      <span className="relative h-14 w-10 shrink-0 overflow-hidden rounded-sm bg-card">
                        {poster && <Image src={poster} alt="" fill className="object-cover" sizes="40px" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                          {part.title}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {[part.year ?? 'Upcoming', runtime].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                      {part.voteAverage ? (
                        <span className="flex shrink-0 items-center gap-1 text-xs tabular-nums text-muted-foreground">
                          <Star className="h-3 w-3 fill-current" /> {part.voteAverage.toFixed(1)}
                        </span>
                      ) : null}
                    </QuickViewLink>
                  </li>
                );
              })}
            </ol>
          </section>
        )}
      </div>
    </div>
  );
}
