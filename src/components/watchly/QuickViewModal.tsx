'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { X, Play, EyeOff, ArrowUpRight } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/button';
import { useUIStore } from '@/client/stores/ui';
import { useAuthStore } from '@/client/stores/auth';
import { buildImageUrl } from '@/lib/tmdb';
import { formatRuntime } from '@/lib/format';
import { FavoriteButton } from '@/components/watchly/FavoriteButton';
import { AddToWatchlistButton } from '@/components/watchlists/AddToWatchlistButton';
import { ProviderSection } from '@/components/title/ProviderSection';
import { ErrorState } from '@/components/watchly/ErrorState';
import { SkeletonBox } from '@/components/watchly/skeletons';
import { PersonQuickViewContent } from '@/components/watchly/PersonQuickView';
import { WatchlistQuickViewContent } from '@/components/watchly/WatchlistQuickView';
import { QuickViewSeasons } from '@/components/watchly/QuickViewSeasons';
import { CollectionCard } from '@/components/title/CollectionCard';
import type { TitlePagePayload } from '@/services/tmdb/title';

// ---------------------------------------------------------------------------
// Global Quick View popup — a lightweight title preview any card can open via
// `useUIStore().openQuickView(mediaType, id)`. Mounted exactly once in
// AuthenticatedShell. The trailer plays INLINE (single-layer Modal, no nested
// TrailerModal) so Escape / scroll-restore keep working.
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

  useEffect(() => {
    // No synchronous setState here: `loading` already inits to true and the
    // component is keyed by mediaType:id (remounts per title), so a fresh open
    // starts in the loading state. The retry path resets loading/error in its
    // click handler before bumping `nonce`.
    const controller = new AbortController();

    fetch(`/api/v1/titles/${mediaType}/${id}`, { signal: controller.signal })
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
  }, [mediaType, id, nonce]);

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
  const {
    details,
    contentRating,
    trailer,
    providers,
    providerSourceNote,
    justWatchUrl,
    fallbackRegion,
    region,
    collection,
    tvSeasons,
  } = data;
  const posterUrl = buildImageUrl(details.posterPath, 'w342');
  const backdropUrl = buildImageUrl(details.backdropPath, 'w780');
  const typeLabel = mediaType === 'tv' ? 'TV Series' : 'Movie';

  // ProviderSection renders null when there's genuinely nothing to show (note
  // is "ok"/"fallback_*" and every bucket is empty). Mirror that here so we
  // don't leave an empty bordered container behind.
  const showProviders =
    providerSourceNote === 'region_missing' ||
    providerSourceNote === 'no_providers' ||
    providers.streaming.length > 0 ||
    providers.rent.length > 0 ||
    providers.buy.length > 0;

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
        <div className="relative w-full aspect-[16/7] bg-muted overflow-hidden">
          {backdropUrl && (
            <Image
              src={backdropUrl}
              alt=""
              fill
              className="object-cover opacity-60"
              sizes="(max-width: 640px) 100vw, 672px"
            />
          )}
          <div className="absolute inset-0 bg-linear-to-t from-background via-background/40 to-transparent" />
        </div>
      )}

      <div className="p-5 sm:p-6 flex flex-col gap-5">
        {/* Poster + primary meta */}
        <div className="flex gap-4">
          {posterUrl && (
            <div className="relative -mt-16 w-24 sm:w-28 shrink-0 aspect-[2/3] rounded-lg overflow-hidden border border-border/40 shadow-xl bg-muted">
              <Image
                src={posterUrl}
                alt={details.title}
                fill
                className="object-cover"
                sizes="112px"
              />
            </div>
          )}

          <div className="flex-1 min-w-0 flex flex-col gap-2">
            <h2 className="text-h3 text-foreground leading-tight">
              {details.title}
            </h2>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground font-medium">
              {details.year && <span>{details.year}</span>}
              <span className="uppercase text-xs font-semibold tracking-wide text-muted-foreground/80">
                {typeLabel}
              </span>
              {contentRating && (
                <span className="border border-muted-foreground/30 px-1.5 rounded text-xs leading-5 uppercase">
                  {contentRating}
                </span>
              )}
              {details.runtimeMinutes ? (
                <span>{formatRuntime(details.runtimeMinutes)}</span>
              ) : null}
            </div>

            {details.genres.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-1">
                {details.genres.map((g) => (
                  <span
                    key={g.id}
                    className="px-2.5 py-0.5 bg-secondary/50 text-secondary-foreground rounded-full text-xs font-semibold border border-border/40"
                  >
                    {g.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-3">
          {trailer && (
            <Button
              variant="secondary"
              onClick={() => setShowTrailer((v) => !v)}
              className="gap-2"
            >
              {showTrailer ? (
                <EyeOff className="w-4 h-4" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              <span>{showTrailer ? 'Hide trailer' : 'Watch trailer'}</span>
            </Button>
          )}

          {isAuthenticated && (
            <>
              <AddToWatchlistButton mediaType={mediaType} mediaId={id} />
              <FavoriteButton id={id} type={mediaType} showText={false} />
            </>
          )}

          {/* The popup is global (store-driven), so close it on navigate or
              it would stay open over the title page. */}
          <Button asChild variant="secondary" className="gap-2">
            <Link href={`/title/${mediaType}/${id}`} onClick={onClose}>
              <ArrowUpRight className="w-4 h-4" />
              <span>Go to Page</span>
            </Link>
          </Button>
        </div>

        {/* Overview */}
        {details.overview && (
          <p className="text-body-regular text-muted-foreground/90 leading-relaxed">
            {details.overview}
          </p>
        )}

        {/* Provider availability */}
        {showProviders && (
          <div className="rounded-lg bg-muted/10 border border-border/40 px-4">
            <ProviderSection
              region={region}
              providers={providers}
              providerSourceNote={providerSourceNote}
              justWatchUrl={justWatchUrl}
              fallbackRegion={fallbackRegion}
            />
          </div>
        )}

        {/* Movie: the franchise it belongs to. Full width to line up with
            the provider box above. */}
        {collection && (
          <CollectionCard
            collection={collection}
            onClick={onClose}
            className="max-w-none"
          />
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
