'use client';

import React, { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { AnimatePresence } from 'framer-motion';
import { Bookmark, Play, Share2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { buildImageUrl } from '@/lib/tmdb';
import { formatRuntime } from '@/lib/format';
import { seriesSummaryParts } from '@/lib/seasons';
import { shareTitle } from '@/lib/share';
import { useAuthStore } from '@/client/stores/auth';
import { RegionPicker } from '@/components/region/RegionPicker';
import { ProviderBadge } from '@/components/ui/ProviderBadge';
import { FavoriteButton } from '@/components/watchly/FavoriteButton';
import { AddToWatchlistButton } from '@/components/watchlists/AddToWatchlistButton';
import { Button } from '@/components/ui/button';
import type { TmdbVideo } from '@/server/tmdb/types';
import type { CrewPerson, TitlePagePayload } from '@/services/tmdb/title';
import type { Offer } from './useTitleAvailability';
import { SeenItButton } from '@/components/watched/SeenItButton';

// Building blocks shared by the title page and Quick View.

export interface TitlePageProps {
  titleData: TitlePagePayload;
  onWatchTrailer: () => void;
  onPlayVideo: (video: TmdbVideo) => void;
  /** Video playing in the hero band (null = backdrop). */
  playing: TmdbVideo | null;
  onClosePlayer: () => void;
}

/** Derived display values the title page and Quick View share. */
export function titleBasics(t: TitlePagePayload) {
  const { details, mediaType, tvSeasons, infoPanelData } = t;
  const runtime = formatRuntime(details.runtimeMinutes);
  return {
    posterUrl: buildImageUrl(details.posterPath, 'w780'),
    backdropUrl: buildImageUrl(details.backdropPath, 'w1280'),
    runtimeLabel: runtime ? (mediaType === 'tv' ? `${runtime} / ep` : runtime) : null,
    seriesSummary: tvSeasons
      ? seriesSummaryParts(tvSeasons.seasons, details.runtimeMinutes)
      : [],
    creditLabel: mediaType === 'tv' ? 'Created by' : 'Directed by',
    creditPeople: (mediaType === 'tv'
      ? infoPanelData.keyCrew.creators
      : infoPanelData.keyCrew.directors
    ).slice(0, 3) as CrewPerson[],
    kindLabel: mediaType === 'tv' ? 'Series' : 'Film',
  };
}

const UNRELEASED_TV = new Set(['Planned', 'In Production', 'Pilot']);

/** Movies: anything but "Released". TV: only statuses that mean not out yet. */
export function isUnreleased(mediaType: string, status: string | null): boolean {
  if (!status) return false;
  return mediaType === 'movie' ? status !== 'Released' : UNRELEASED_TV.has(status);
}

/** TMDB popularity is unbounded; show a readable tier, or nothing when low. */
export function popularityTier(popularity: number | null): string | null {
  if (popularity == null) return null;
  if (popularity >= 100) return 'Trending now';
  if (popularity >= 20) return 'Popular';
  return null;
}

export function languageName(code: string | null): string | null {
  if (!code) return null;
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** Poster with a typographic stand-in when TMDB has no artwork. */
export function PosterArt({
  src,
  title,
  sizes,
  priority,
  className,
}: {
  src: string | null;
  title: string;
  sizes: string;
  priority?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('relative aspect-2/3 overflow-hidden bg-card', className)}>
      {src ? (
        <Image src={src} alt={`${title} poster`} fill priority={priority} sizes={sizes} className="object-cover" />
      ) : (
        <div className="absolute inset-0 flex items-end p-5 border border-border">
          <span className="text-3xl font-bold leading-none tracking-tight text-foreground/80">
            {title}
          </span>
        </div>
      )}
    </div>
  );
}

/** Logo tile + provider name. Logos never stand alone. */
export function OfferChip({ offer, note, className }: { offer: Offer; note?: string; className?: string }) {
  return (
    <div className={cn('flex items-center gap-2.5 min-w-0', className)}>
      <ProviderBadge
        label={offer.provider_name}
        providerId={offer.provider_id}
        logoPath={offer.logo_path}
        size="md"
      />
      <div className="flex flex-col min-w-0 leading-tight">
        <span className="text-sm font-semibold text-foreground truncate">{offer.provider_name}</span>
        {note && <span className="text-xs text-muted-foreground">{note}</span>}
      </div>
    </div>
  );
}

/** "Change region" trigger opening the existing region picker. */
export function RegionSwitch({ className, children }: { className?: string; children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cn(
          'text-xs text-muted-foreground underline underline-offset-4 decoration-muted-foreground/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm',
          className,
        )}
      >
        {children ?? 'Change region'}
      </button>
      <AnimatePresence>
        {open && (
          <div className="absolute left-0 top-full mt-2 z-50">
            <RegionPicker onClose={() => setOpen(false)} />
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

export const OUTLINE_BTN =
  'h-10 gap-2 px-4 border border-border bg-transparent text-foreground hover:bg-secondary/60';

const STACK_BTN =
  'w-full h-11 justify-start gap-2.5 px-4 border border-border bg-transparent text-foreground hover:bg-secondary/60';

// A row inside the joined "your lists" group: the group draws the border.
const GROUP_BTN =
  'w-full h-11 justify-start gap-2.5 px-4 rounded-none border-0 bg-transparent text-foreground hover:bg-secondary/60';

/**
 * Banani-style action column: Trailer as the one filled button, the rest
 * outlined and left-aligned. Watchlist, Favorite and Seen it all log the
 * title to your lists, so they sit together as one joined group. Phones:
 * Trailer and Share side by side, the group full width below. From md: one
 * column, Trailer → group → Share.
 * FavoriteButton ignores className, so its look is set from the wrapper.
 */
export function ActionStack({
  titleData,
  onWatchTrailer,
  className,
}: Pick<TitlePageProps, 'titleData' | 'onWatchTrailer'> & { className?: string }) {
  const isAuthenticated = useAuthStore((s) => s.status === 'authenticated');
  const { mediaType, id, details, trailer } = titleData;

  return (
    <div className={cn('grid grid-cols-2 md:grid-cols-1 gap-2 w-full md:w-56', className)}>
      {trailer && (
        <Button onClick={onWatchTrailer} className="w-full h-11 justify-start gap-2.5 px-4">
          <Play className="w-4 h-4" />
          Watch Trailer
        </Button>
      )}
      {isAuthenticated ? (
        <div
          role="group"
          aria-label="Your lists"
          className="order-2 col-span-2 flex flex-col divide-y divide-border overflow-hidden rounded-md border border-border md:order-1 md:col-span-1"
        >
          {/* Wrapped so the group's divider lands on the div, not the borderless button. */}
          <div>
            <AddToWatchlistButton
              mediaType={mediaType}
              mediaId={id}
              title={details.title}
              fetchInitial
              className={GROUP_BTN}
            />
          </div>
          <div className="[&_button]:w-full [&_button]:h-11 [&_button]:justify-start [&_button]:gap-2.5 [&_button]:px-4 [&_button]:rounded-none [&_button]:border-0 [&_button]:bg-transparent [&_button:hover]:bg-secondary/60 [&_svg]:w-4 [&_svg]:h-4">
            <FavoriteButton key={id} id={id} type={mediaType} showText fetchInitial />
          </div>
          <SeenItButton
            key={`seen-${id}`}
            mediaType={mediaType}
            mediaId={id}
            title={details.title}
            posterPath={details.posterPath}
            year={details.year}
            variant="stack"
            surface="title"
            className={GROUP_BTN}
          />
        </div>
      ) : (
        <Button variant="secondary" asChild className={cn(STACK_BTN, 'order-2 col-span-2 md:order-1 md:col-span-1')}>
          <Link href="/signin">
            <Bookmark className="w-4 h-4" />
            Sign in to save
          </Link>
        </Button>
      )}
      <Button
        variant="secondary"
        onClick={() => shareTitle(mediaType, id, details.title)}
        className={cn(STACK_BTN, 'order-1 md:order-2', !trailer && 'col-span-2 md:col-span-1')}
      >
        <Share2 className="w-4 h-4" />
        Share
      </Button>
    </div>
  );
}

/** "ends 11:40 PM" — computed after mount to avoid a hydration mismatch. */
export function useFinishTime(minutes: number | null): string | null {
  const [label, setLabel] = useState<string | null>(null);
  useEffect(() => {
    if (!minutes) return;
    const end = new Date(Date.now() + minutes * 60_000);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- client clock only
    setLabel(end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
  }, [minutes]);
  return label;
}

/** Section heading used across the lower page. */
export function SectionTitle({ children, id, className }: { children: React.ReactNode; id?: string; className?: string }) {
  return (
    <h2 id={id} className={cn('text-lg font-bold tracking-tight text-foreground', className)}>
      {children}
    </h2>
  );
}
