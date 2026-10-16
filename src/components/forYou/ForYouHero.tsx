'use client';

import { useState, useTransition } from 'react';
import { QuickViewLink } from '@/components/watchly/QuickViewLink';
import Image from 'next/image';
import { Play, RefreshCw, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProviderBadge } from '@/components/ui/ProviderBadge';
import { ReasonBadge } from './ReasonBadge';
import { buildImageUrl } from '@/lib/tmdb';
import { useToast } from '@/hooks/useToast';
import { spinHeroAction, markAsWatchedAction } from '@/actions/forYou';
import { cn } from '@/lib/cn';
import type { ForYouCandidate } from '@/services/forYou';

interface ForYouHeroProps {
  initialHero: ForYouCandidate;
}

/**
 * "Tonight's Pick" hero card. Big poster on the left, title + reason +
 * providers + actions on the right. Spin Again swaps the hero in-place
 * via spinHeroAction (which excludes the current pick).
 */
export function ForYouHero({ initialHero }: ForYouHeroProps) {
  const [hero, setHero] = useState<ForYouCandidate>(initialHero);
  // Cumulative set of "mediaType:tmdbId" keys the user has rotated through.
  // Without this Spin Again ping-pongs between two titles when seeds are
  // sparse (the server would only ever exclude the immediately-previous
  // pick, so the next spin's previous pick becomes a valid candidate again).
  const [excludedKeys, setExcludedKeys] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  const handleMarkWatched = () => {
    // Spin the hero immediately after marking so the user sees a fresh
    // pick — the just-watched title is already in the exclude set by the
    // time the new feed loads.
    const currentKey = `${hero.mediaType}:${hero.tmdbId}`;
    startTransition(async () => {
      try {
        const where = await markAsWatchedAction(hero.tmdbId, hero.mediaType);
        toast.success(
          where === 'watchlist_finished'
            ? 'Marked as finished in your watchlist'
            : 'Saved to watched',
        );
        const next = await spinHeroAction([currentKey]);
        if (next) setHero(next);
      } catch {
        toast.error("Couldn't mark as watched", 'Please try again.');
      }
    });
  };

  const handleSpin = () => {
    const currentKey = `${hero.mediaType}:${hero.tmdbId}`;
    const nextExclude = excludedKeys.includes(currentKey)
      ? excludedKeys
      : [...excludedKeys, currentKey];

    startTransition(async () => {
      try {
        const next = await spinHeroAction(nextExclude);
        if (next) {
          setHero(next);
          setExcludedKeys(nextExclude);
        } else {
          toast.info("That's all we've got", 'No more recommendations to spin to.');
        }
      } catch {
        toast.error("Couldn't spin", 'Please try again.');
      }
    });
  };

  const posterUrl = buildImageUrl(hero.posterPath, 'w342');
  // CTA copy reads from the media type instead of the streaming provider —
  // simpler and works whether or not a provider is available in the user's
  // region.
  const openLabel = hero.mediaType === 'movie' ? 'Open Film' : 'Open Series';

  const metaPieces = [
    hero.year,
    hero.runtimeMinutes
      ? hero.mediaType === 'movie'
        ? formatMovieRuntime(hero.runtimeMinutes)
        : `${hero.runtimeMinutes}m / ep`
      : null,
    hero.genres.slice(0, 2).join(', ') || null,
  ].filter((p): p is string => Boolean(p));

  return (
    <div className="relative rounded-xl border border-border bg-card overflow-hidden">
      {/* Top gradient bar — mirrors the mockup's accent line. */}
      <div className="h-0.5 bg-linear-to-r from-primary via-primary/40 to-transparent" />

      <div className="flex flex-col md:flex-row gap-6 p-5 md:p-6">
        {/* Poster */}
        <QuickViewLink
          mediaType={hero.mediaType}
          titleId={hero.tmdbId}
          className="relative w-full max-w-[200px] md:max-w-[220px] shrink-0 mx-auto md:mx-0 aspect-2/3 rounded-lg overflow-hidden bg-muted shadow-elevation-card group"
        >
          {posterUrl ? (
            <Image
              src={posterUrl}
              alt={hero.title}
              fill
              className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
              sizes="220px"
              priority
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted-foreground text-xs">
              No Image
            </div>
          )}
        </QuickViewLink>

        {/* Info */}
        <div className="flex-1 min-w-0 flex flex-col gap-4">
          {hero.reason && <ReasonBadge tone="primary">{hero.reason}</ReasonBadge>}

          <QuickViewLink
            mediaType={hero.mediaType}
            titleId={hero.tmdbId}
            className="text-3xl md:text-4xl font-bold tracking-tight leading-tight text-foreground hover:text-primary transition-colors"
          >
            {hero.title}
          </QuickViewLink>

          {metaPieces.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {metaPieces.map((p, i) => (
                <span key={i}>{p}</span>
              ))}
            </div>
          )}

          {hero.providers.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs uppercase tracking-wider text-muted-foreground">
                Streaming on
              </span>
              {hero.providers.slice(0, 3).map((p) => (
                <ProviderBadge
                  key={p.providerId}
                  providerId={p.providerId}
                  label={p.providerName}
                  size="md"
                />
              ))}
            </div>
          )}

          {hero.overview && (
            <p className="text-sm md:text-base text-muted-foreground/90 leading-relaxed line-clamp-3 md:line-clamp-4">
              {hero.overview}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2 mt-1">
            <QuickViewLink mediaType={hero.mediaType} titleId={hero.tmdbId}>
              <Button className="gap-2">
                <Play className="w-4 h-4" />
                {openLabel}
              </Button>
            </QuickViewLink>
            <Button
              variant="outline"
              onClick={handleMarkWatched}
              disabled={pending}
              className="gap-2"
            >
              <Check className="w-4 h-4" />
              Mark as Watched
            </Button>
            <Button
              variant="outline"
              onClick={handleSpin}
              disabled={pending}
              className="gap-2"
            >
              <RefreshCw className={cn('w-4 h-4', pending && 'animate-spin')} />
              Spin Again
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatMovieRuntime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
