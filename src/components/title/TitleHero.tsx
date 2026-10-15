import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { buildImageUrl } from '@/lib/tmdb';
import { formatRuntime } from '@/lib/format';
import { TitlePagePayload } from '@/services/tmdb/title';
import { TitleActions } from './TitleActions';
import { ClientProviderSection } from './ClientProviderSection';
import { TopCastRow } from './TopCastRow';
import { CollectionCard } from './CollectionCard';
import { TvSeasonsEpisodesPanel } from './TvSeasonsEpisodesPanel';

import { DetailsTab } from './tabs/DetailsTab';

interface TitleHeroProps {
  titleData: TitlePagePayload;
  onWatchTrailer?: () => void;
}

export function TitleHero({ titleData, onWatchTrailer }: TitleHeroProps) {
  const {
    details,
    contentRating,
    trailer,
    cast,
    mediaType,
    id,
    infoPanelData,
    collection,
    tvSeasons,
  } = titleData;
  const posterUrl = buildImageUrl(details.posterPath, 'w500');
  const backdropUrl = buildImageUrl(details.backdropPath, 'w1280');

  return (
    <div className="relative w-full min-h-screen overflow-hidden">
      {/* Background Image with Gradient Overlay */}
      <div className="absolute inset-0 z-0">
        {backdropUrl && (
          <Image
            src={backdropUrl}
            alt=""
            fill
            className="object-cover opacity-20"
            sizes="100vw"
          />
        )}
        <div className="absolute inset-0 bg-linear-to-t from-background via-background/95 to-transparent" />
        <div className="absolute inset-0 bg-linear-to-r from-background via-background/40 to-transparent" />
      </div>

      <div className="relative z-10 container mx-auto px-4 py-8 md:py-12 flex flex-col gap-12">
        {/* Top Section: Poster + Main Info */}
        <div className="flex flex-col md:flex-row gap-8 items-start">
          {/* Poster (Left) */}
          <div className="w-full max-w-[350px] shrink-0 mx-auto md:mx-0 shadow-2xl rounded-lg overflow-hidden border border-border/20">
            <div className="aspect-2/3 relative bg-muted">
              {posterUrl ? (
                <Image
                  src={posterUrl}
                  alt={details.title}
                  fill
                  className="object-cover"
                  priority
                  sizes="(max-width: 768px) 100vw, 350px"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  No Poster
                </div>
              )}
            </div>
          </div>

          {/* Info Column (Right) */}
          <div className="flex-1 min-w-0 flex flex-col gap-8 w-full">
            {/* Title & Meta */}
            <div className="flex flex-col gap-3">
              <h1 className="text-4xl md:text-5xl font-bold leading-tight tracking-tight text-foreground">
                {details.title}
              </h1>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm md:text-base text-muted-foreground font-medium">
                {details.year && <span>{details.year}</span>}
                {contentRating && (
                  <span className="border border-muted-foreground/30 px-1.5 rounded text-xs leading-5 uppercase">
                    {contentRating}
                  </span>
                )}
                {details.runtimeMinutes && (
                  <span>{formatRuntime(details.runtimeMinutes)}</span>
                )}
              </div>

              {/* Genre Pills */}
              <div className="flex flex-wrap gap-2 mt-1">
                {details.genres.map(g => (
                  <Link
                    key={g.id}
                    href={`/search?genre=${g.id}&type=${mediaType}`}
                    aria-label={`Search ${g.name} ${mediaType === 'tv' ? 'shows' : 'movies'}`}
                    className="px-3 py-1 bg-secondary/50 text-secondary-foreground rounded-full text-xs font-semibold backdrop-blur-sm border border-white/5 transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    {g.name}
                  </Link>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-4">
              <TitleActions
                trailer={trailer}
                onWatchTrailer={onWatchTrailer}
                mediaType={mediaType}
                id={id}
                title={details.title}
              />
            </div>

            {/* Providers — fetched client-side by region so the page stays
                ISR-cacheable (see ClientProviderSection). */}
            <div className="bg-muted/10 rounded-lg px-6 py-4 border border-white/5 backdrop-blur-md">
              <ClientProviderSection mediaType={mediaType} id={id} />
            </div>

            {/* Overview */}
            <div className="flex flex-col gap-2">
              <p className="text-lg leading-relaxed text-muted-foreground/90 max-w-4xl">
                {details.overview}
              </p>
              
              {/* Collection Link */}
              {collection && (
                <div className="mt-6">
                  <CollectionCard collection={collection} />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* TV Seasons & Episodes */}
        {mediaType === "tv" && tvSeasons && (
          <div className="w-full">
            <TvSeasonsEpisodesPanel seriesId={tvSeasons.seriesId} seasons={tvSeasons.seasons} />
          </div>
        )}

        {/* Bottom Section: Top Cast + Details */}
        <div className="flex flex-col gap-8 w-full">
          {/* Top Cast */}
          <TopCastRow cast={cast} />

          {/* Details */}
          <DetailsTab data={infoPanelData} />
        </div>
      </div>
    </div>
  );
}
