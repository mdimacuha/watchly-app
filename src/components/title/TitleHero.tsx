'use client';

import React, { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { CollectionCard } from './CollectionCard';
import { TvSeasonsEpisodesPanel } from './TvSeasonsEpisodesPanel';
import { ActionStack, PosterArt, titleBasics, type TitlePageProps } from './titleParts';
import { TitleHeader } from './TitleHeader';
import { AvailabilityStrip } from './AvailabilityStrip';
import type { Availability } from './useTitleAvailability';
import type { ReviewAggregate } from '@/services/reviews';
import type { TitlePagePayload } from '@/services/tmdb/title';

// Backdrop band height → player height (16:9, capped so the title stays in reach).
const BAND_HEIGHT = '360px';
const PLAYER_HEIGHT = 'min(56.25vw, 78vh)';
// The video mounts once the band has mostly opened, so it doesn't load into a sliver.
const PLAYER_MOUNT_DELAY_MS = 350;

// The page hero: backdrop band with the poster breaking out of it on
// desktop, full-bleed poster on mobile, then title → availability →
// actions. When a video plays, the band grows into a 16:9 player and pushes
// the rest down (the poster stops overlapping it). `aside` adds a third
// column on wide screens.
export function TitleHero({
  titleData,
  onWatchTrailer,
  playing,
  onClosePlayer,
  aggregate,
  availability,
  aside,
}: Pick<TitlePageProps, 'titleData' | 'onWatchTrailer' | 'playing' | 'onClosePlayer'> & {
  aggregate: ReviewAggregate | null;
  availability: Availability;
  aside?: React.ReactNode;
}) {
  const b = titleBasics(titleData);
  const [mounted, setMounted] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Mount the iframe after the band opens; Esc closes; focus the close button.
  useEffect(() => {
    if (!playing) return;
    const t = setTimeout(() => setMounted(playing.key), PLAYER_MOUNT_DELAY_MS);
    closeRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClosePlayer();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', onKey);
    };
  }, [playing, onClosePlayer]);
  const showVideo = !!playing && mounted === playing.key;

  return (
    <div className="w-full">
      <div
        className={cn(
          'relative overflow-hidden bg-background transition-[height] duration-500 ease-out motion-reduce:transition-none',
          playing ? 'block' : 'hidden md:block',
          // Under the floating sidebar the backdrop runs to the screen edge, so the
          // translucent panel shows it. Never while a trailer plays: nothing over
          // the player.
          !playing && 'md:-ml-(--float-bleed)',
        )}
        style={{ height: playing ? PLAYER_HEIGHT : BAND_HEIGHT }}
      >
        {b.backdropUrl && (
          <Image
            src={b.backdropUrl}
            alt=""
            fill
            priority
            sizes="100vw"
            className={cn(
              'object-cover object-top transition-opacity duration-500 motion-reduce:transition-none',
              playing ? 'opacity-20' : 'opacity-60',
            )}
          />
        )}
        {!playing && <div className="absolute inset-0 bg-linear-to-b from-background/10 via-background/50 to-background" />}

        {playing && (
          <>
            {showVideo && (
              <iframe
                key={playing.key}
                className="absolute inset-0 h-full w-full"
                src={`https://www.youtube.com/embed/${playing.key}?autoplay=1&rel=0`}
                title={playing.name}
                allow="autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
              />
            )}
            <button
              ref={closeRef}
              type="button"
              onClick={onClosePlayer}
              className="absolute right-4 top-4 z-30 inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/80 px-3 py-1.5 text-sm text-foreground hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:right-6 md:top-6"
            >
              <X className="h-4 w-4" /> Close
            </button>
          </>
        )}
      </div>

      <div className="container mx-auto px-0 md:px-8">
        <div
          className={cn(
            'relative flex flex-col md:flex-row md:gap-10 transition-[margin] duration-500 ease-out motion-reduce:transition-none',
            playing ? 'mt-6 md:mt-8' : 'md:-mt-56',
          )}
        >
          <div className="relative md:w-[300px] shrink-0">
            <PosterArt
              src={b.posterUrl}
              title={titleData.details.title}
              priority
              sizes="(max-width: 768px) 100vw, 300px"
              className="w-full md:rounded-md md:border md:border-foreground/10 md:shadow-elevation-card"
            />
            <div className="md:hidden absolute inset-x-0 bottom-0 h-1/3 bg-linear-to-t from-background to-transparent" />
          </div>

          <div className="relative flex-1 min-w-0 flex flex-col gap-5 px-4 md:px-0 -mt-16 md:mt-0 md:pt-24">
            {/* Title left, action column right; both above the providers. */}
            <div className="flex flex-col md:flex-row md:items-end gap-5 md:gap-8">
              <div className="flex-1 min-w-0">
                <TitleHeader titleData={titleData} aggregate={aggregate} />
              </div>
              <ActionStack titleData={titleData} onWatchTrailer={onWatchTrailer} className="shrink-0" />
            </div>
            <AvailabilityStrip availability={availability} />
          </div>

          {aside && <div className="hidden xl:block w-[280px] shrink-0 md:pt-24">{aside}</div>}
        </div>
      </div>
    </div>
  );
}

export function OverviewBlock({ titleData }: { titleData: TitlePagePayload }) {
  const { details, collection } = titleData;
  return (
    <section aria-labelledby="overview-heading" className="flex flex-col gap-3">
      <h2 id="overview-heading" className="text-lg font-bold tracking-tight text-foreground">Overview</h2>
      <p className="max-w-[68ch] text-base leading-relaxed text-muted-foreground">
        {details.overview || 'No synopsis on TMDB yet.'}
      </p>
      {collection && <CollectionCard collection={collection} className="mt-2" />}
    </section>
  );
}

export function SeasonsBlock({ titleData }: { titleData: TitlePagePayload }) {
  const { mediaType, tvSeasons, details } = titleData;
  if (mediaType !== 'tv' || !tvSeasons) return null;
  return (
    <TvSeasonsEpisodesPanel
      seriesId={tvSeasons.seriesId}
      seasons={tvSeasons.seasons}
      episodeRuntime={details.runtimeMinutes}
    />
  );
}
