'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { X, Play, EyeOff, ArrowUpRight, Share2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/button';
import { useUIStore } from '@/client/stores/ui';
import { useAuthStore } from '@/client/stores/auth';
import { useRegionStore } from '@/client/stores/region';
import { buildImageUrl } from '@/lib/tmdb';
import { shareTitle } from '@/lib/share';
import { FavoriteButton } from '@/components/watchly/FavoriteButton';
import { AddToWatchlistButton } from '@/components/watchlists/AddToWatchlistButton';
import { TitleHeader } from '@/components/title/TitleHeader';
import { AvailabilityStrip } from '@/components/title/AvailabilityStrip';
import { OUTLINE_BTN } from '@/components/title/titleParts';
import { toAvailability } from '@/components/title/useTitleAvailability';
import { ErrorState } from '@/components/watchly/ErrorState';
import { SkeletonBox } from '@/components/watchly/skeletons';
import { PersonQuickViewContent } from '@/components/watchly/PersonQuickView';
import { WatchlistQuickViewContent } from '@/components/watchly/WatchlistQuickView';
import { CollectionQuickViewContent } from '@/components/watchly/CollectionQuickView';
import { QuickViewSeasons } from '@/components/watchly/QuickViewSeasons';
import { CollectionCard } from '@/components/title/CollectionCard';
import type { TitlePagePayload } from '@/services/tmdb/title';

// ---------------------------------------------------------------------------
// Global Quick View popup — a lightweight title preview any card can open via
// `useUIStore().openQuickView(mediaType, id)`. Mounted exactly once in
// AuthenticatedShell. The trailer plays INLINE (single-layer Modal, no nested
// modal) so Escape / scroll-restore keep working.
// ---------------------------------------------------------------------------

export function QuickViewModal() {
  const quickView = useUIStore((s) => s.quickView);
  const closeQuickView = useUIStore((s) => s.closeQuickView);

  return (
    <Modal
      isOpen={!!quickView}
      onClose={closeQuickView}
      // We render our own close control so it sits legibly over the backdrop /
      // inline trailer instead of Modal's default X overlapping the video.
      hideCloseButton
      // Fixed cap (~a movie's popup without extras) so the popup keeps one
      // size; longer content (seasons, collection) scrolls inside it.
      className="max-w-2xl max-h-[min(90dvh,53rem)] bg-background"
      // Still scrolls (wheel / touch / keyboard), just without the bar.
      bodyClassName="no-scrollbar"
    >
      {/* Key by target so all local state (data, loading, trailer toggle)
          resets cleanly when a different card — or a role inside a person
          preview — opens the popup. */}
      {quickView?.mediaType === 'person' ? (
        <PersonQuickViewContent
          key={`person:${quickView.id}`}
          id={quickView.id}
          onClose={closeQuickView}
          closeButton={<QuickViewCloseButton onClose={closeQuickView} />}
        />
      ) : quickView?.mediaType === 'collection' ? (
        <CollectionQuickViewContent
          key={`collection:${quickView.id}`}
          id={quickView.id}
          onClose={closeQuickView}
          closeButton={<QuickViewCloseButton onClose={closeQuickView} />}
        />
      ) : quickView?.mediaType === 'watchlist' ? (
        <WatchlistQuickViewContent
          key={`watchlist:${quickView.id}`}
          id={quickView.id}
          onClose={closeQuickView}
          closeButton={<QuickViewCloseButton onClose={closeQuickView} />}
        />
      ) : quickView ? (
        <QuickViewContent
          key={`${quickView.mediaType}:${quickView.id}`}
          mediaType={quickView.mediaType}
          id={quickView.id}
          onClose={closeQuickView}
        />
      ) : null}
    </Modal>
  );
}

// ---------------------------------------------------------------------------

function QuickViewCloseButton({ onClose }: { onClose: () => void }) {
  // Zero-height sticky rail: the button stays pinned to the top-right while
  // the popup content scrolls underneath, without taking up layout space.
  return (
    <div className="sticky top-0 z-30 h-0">
      <button
        type="button"
        onClick={onClose}
        className="absolute top-3 right-3 z-30 p-2 rounded-full bg-black/50 text-white/90 hover:bg-black/70 hover:text-white transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        aria-label="Close quick view"
      >
        <X className="w-5 h-5" />
      </button>
    </div>
  );
}

interface QuickViewContentProps {
  mediaType: 'movie' | 'tv';
  id: string;
  onClose: () => void;
}

function QuickViewContent({ mediaType, id, onClose }: QuickViewContentProps) {
  const isAuthenticated = useAuthStore((s) => s.status === 'authenticated');
  const [data, setData] = useState<TitlePagePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [showTrailer, setShowTrailer] = useState(false);
  const [nonce, setNonce] = useState(0);
  // Re-fetch when the region changes (the strip's "Change region").
  const regionCode = useRegionStore((s) => s.regionCode);

  useEffect(() => {
    // No synchronous setState here: `loading` already inits to true and the
    // component is keyed by mediaType:id (remounts per title), so a fresh open
    // starts in the loading state. The retry path resets loading/error in its
    // click handler before bumping `nonce`.
    const controller = new AbortController();

    const q = regionCode ? `?region=${encodeURIComponent(regionCode)}` : '';
    fetch(`/api/v1/titles/${mediaType}/${id}${q}`, { signal: controller.signal })
      .then(async (res) => {
        // Route envelope is `{ ok: true, data }` / `{ ok: false, error }`.
        const json = (await res.json()) as
          | { ok: true; data: TitlePagePayload }
          | { ok: false; error: { code: string; message: string } };
        if (!res.ok || json.ok !== true) {
          throw new Error('Failed to load title');
        }
        setData(json.data);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [mediaType, id, nonce, regionCode]);

  const CloseButton = <QuickViewCloseButton onClose={onClose} />;

  // ----- Loading -----
  if (loading) {
    return (
      <div className="relative">
        {CloseButton}
        <SkeletonBox className="aspect-[16/7] w-full rounded-none" />
        <div className="p-5 sm:p-6 flex flex-col gap-5">
          <div className="flex gap-4">
            <SkeletonBox className="-mt-16 w-24 sm:w-28 shrink-0 aspect-[2/3] rounded-lg" />
            <div className="flex-1 min-w-0 flex flex-col gap-3 pt-1">
              <SkeletonBox className="h-6 w-2/3" />
              <SkeletonBox className="h-4 w-1/3" />
              <SkeletonBox className="h-5 w-1/2" />
            </div>
          </div>
          <SkeletonBox className="h-16 w-full" />
          <SkeletonBox className="h-24 w-full" />
        </div>
      </div>
    );
  }

  // ----- Error -----
  if (error || !data) {
    return (
      <div className="relative">
        {CloseButton}
        <ErrorState
          title="Couldn't load title"
          description="Something went wrong loading this title. Please try again."
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

  // ----- Loaded -----
  const { details, trailer, collection, tvSeasons } = data;
  const posterUrl = buildImageUrl(details.posterPath, 'w342');
  const backdropUrl = buildImageUrl(details.backdropPath, 'w780');

  return (
    <div className="relative">
      {CloseButton}

      {/* Hero: inline trailer when toggled, otherwise the backdrop banner. */}
      {showTrailer && trailer ? (
        <div className="relative w-full aspect-video bg-black">
          <iframe
            className="w-full h-full"
            src={`https://www.youtube.com/embed/${trailer.key}?autoplay=1&rel=0`}
            title={trailer.name}
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        </div>
      ) : (
        <div className="relative w-full aspect-[16/7] bg-card overflow-hidden">
          {backdropUrl && (
            <Image
              src={backdropUrl}
              alt=""
              fill
              className="object-cover object-top opacity-60"
              sizes="(max-width: 640px) 100vw, 672px"
            />
          )}
          <div className="absolute inset-0 bg-linear-to-b from-background/10 via-background/50 to-background" />
        </div>
      )}

      <div className="p-5 sm:p-6 flex flex-col gap-5">
        {/* Poster + the same header as the title page */}
        <div className="flex gap-4 sm:gap-5">
          {posterUrl && (
            <div className="relative -mt-20 w-24 sm:w-32 shrink-0 self-start aspect-[2/3] rounded-md overflow-hidden border border-foreground/10 shadow-elevation-card bg-card">
              <Image
                src={posterUrl}
                alt={`${details.title} poster`}
                fill
                className="object-cover"
                sizes="128px"
              />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <TitleHeader titleData={data} aggregate={null} compact />
          </div>
        </div>

        {/* Actions — trailer is the one filled (accent) button, like the page. */}
        <div className="flex flex-wrap items-center gap-2">
          {trailer && (
            <Button onClick={() => setShowTrailer((v) => !v)} className="h-10 gap-2 px-4">
              {showTrailer ? <EyeOff className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              <span>{showTrailer ? 'Hide trailer' : 'Watch trailer'}</span>
            </Button>
          )}

          {isAuthenticated && (
            <>
              {/* fetchInitial: the payload is region data only, so per-user state is looked up here. */}
              <AddToWatchlistButton mediaType={mediaType} mediaId={id} title={details.title} fetchInitial className={OUTLINE_BTN} />
              {/* FavoriteButton ignores className; style it from the wrapper. */}
              <div className="[&_button]:h-10 [&_button]:w-10 [&_button]:border [&_button]:border-border [&_button]:bg-transparent [&_button:hover]:bg-secondary/60">
                <FavoriteButton id={id} type={mediaType} showText={false} fetchInitial />
              </div>
            </>
          )}

          <Button
            variant="secondary"
            size="icon"
            onClick={() => shareTitle(mediaType, id, details.title)}
            aria-label="Share"
            className={`${OUTLINE_BTN} w-10 px-0`}
          >
            <Share2 className="w-4 h-4" />
          </Button>

          {/* The popup is global (store-driven), so close it on navigate or
              it would stay open over the title page. */}
          <Button asChild variant="secondary" className={`${OUTLINE_BTN} ml-auto`}>
            <Link href={`/title/${mediaType}/${id}`} onClick={onClose}>
              <ArrowUpRight className="w-4 h-4" />
              <span>Go to page</span>
            </Link>
          </Button>
        </div>

        {/* Same fallback chain + strip as the title page. */}
        <AvailabilityStrip availability={toAvailability(data)} stacked />

        {details.overview && (
          <p className="text-sm leading-relaxed text-muted-foreground">{details.overview}</p>
        )}

        {/* Movie: the franchise it belongs to — opens the collection Quick View in place. */}
        {collection && (
          <CollectionCard collection={collection} className="max-w-none" />
        )}

        {/* TV: seasons with episode counts + estimated run times. */}
        {tvSeasons && (
          <QuickViewSeasons
            tvSeasons={tvSeasons}
            episodeRuntime={details.runtimeMinutes}
            onNavigate={onClose}
          />
        )}
      </div>
    </div>
  );
}
