'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { buildImageUrl } from '@/lib/tmdb';
import { PersonPagePayload } from '@/services/tmdb/person';
import { PosterCard } from '@/components/watchly/PosterCard';
import { TitleTabs } from '@/components/title/TitleTabs';
import { QuickViewLink } from '@/components/watchly/QuickViewLink';
import { ExpandableText } from '@/components/ui/ExpandableText';
import { FavoriteButton } from '@/components/watchly/FavoriteButton';
import { BackLink } from '@/components/nav/BackLink';
import { useAuthStore } from '@/client/stores/auth';
import { useRegionBadges } from '@/components/watchly/useRegionBadges';

interface ArtistClientProps {
  payload: PersonPagePayload;
}

export function ArtistClient({ payload }: ArtistClientProps) {
  const isAuthenticated = useAuthStore((s) => s.status === 'authenticated');
  const { details, credits } = payload;
  // Availability for the visitor's region, loaded after hydration (the page
  // HTML is cached and region-agnostic).
  const badges = useRegionBadges(payload.badgeTargets);
  const defaultTab =
    details.knownForDepartment === 'Acting' || credits.cast.length > 0
      ? 'cast'
      : 'crew';

  const [activeTab, setActiveTab] = useState(defaultTab);

  const tabs = [
    { key: 'cast', label: `Acting (${credits.cast.length})` },
    { key: 'crew', label: `Production (${credits.crew.length})` },
  ].filter(t =>
    t.key === 'cast' ? credits.cast.length > 0 : credits.crew.length > 0
  );

  const currentCredits = activeTab === 'cast' ? credits.cast : credits.crew;

  // Sort by release date descending
  const sortedCredits = [...currentCredits].sort((a, b) => {
    if (!a.releaseDate) return 1;
    if (!b.releaseDate) return -1;
    return (
      new Date(b.releaseDate).getTime() - new Date(a.releaseDate).getTime()
    );
  });

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header Section */}
      <div className="relative w-full">
        {/* Background gradient/image could go here */}
        {/* Runs under the floating sidebar too, so the tint has no seam. */}
        <div className="absolute inset-0 z-0 bg-linear-to-b from-primary/5 to-background md:-left-(--float-bleed)" />

        <div className="container relative z-10 px-4 pt-24 pb-12 mx-auto">
          <BackLink fallbackHref="/programme" className="mb-8" />
          <div className="flex flex-col md:flex-row gap-8 items-center md:items-start">
            {/* Profile Image */}
            <div className="shrink-0 w-48 h-72 relative rounded-lg overflow-hidden shadow-2xl ring-1 ring-white/10">
              {details.profilePath ? (
                <Image
                  src={buildImageUrl(details.profilePath, 'w500') || ''}
                  alt={details.name}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 192px, 300px"
                  priority
                />
              ) : (
                <div className="w-full h-full bg-muted flex items-center justify-center text-muted-foreground">
                  No Image
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex flex-col gap-4 text-center md:text-left max-w-2xl">
              <h1 className="text-4xl md:text-5xl font-bold text-foreground tracking-tight">
                {details.name}
              </h1>

              <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground justify-center md:justify-start">
                {details.knownForDepartment && (
                  <span className="bg-secondary/50 px-3 py-1 rounded-full text-secondary-foreground">
                    {details.knownForDepartment}
                  </span>
                )}
                {details.birthday && (
                  <span className="flex items-center gap-1">
                    Born:{' '}
                    {new Date(details.birthday).toLocaleDateString(undefined, {
                      dateStyle: 'long',
                    })}
                  </span>
                )}
                {details.placeOfBirth && (
                  <span className="flex items-center gap-1">
                    in {details.placeOfBirth}
                  </span>
                )}
                {details.deathday && (
                  <span className="flex items-center gap-1 text-red-400">
                    Died:{' '}
                    {new Date(details.deathday).toLocaleDateString(undefined, {
                      dateStyle: 'long',
                    })}
                  </span>
                )}
              </div>

              {details.biography && (
                <ExpandableText
                  text={details.biography}
                  className="text-muted-foreground/90 leading-relaxed text-sm md:text-base"
                  maxHeight="max-h-[160px]"
                  truncateLength={140}
                />
              )}
              {isAuthenticated && (
                <div>
                  <FavoriteButton
                    id={details.id}
                    type="artist"
                    className="w-full md:w-auto mt-2"
                    fetchInitial
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs & Grid */}
      <div className="container px-4 mx-auto">
        <TitleTabs
          tabs={tabs}
          activeKey={activeTab}
          onChange={setActiveTab}
          className="mb-8"
        />

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-4 gap-y-8">
          {sortedCredits.map(credit => (
            <div
              key={credit.creditId}
              className="flex flex-col gap-2"
            >
              <QuickViewLink
                mediaType={credit.mediaType}
                titleId={credit.id}
                className="group"
              >
                <PosterCard
                  title={credit.title}
                  year={
                    credit.releaseDate
                      ? new Date(credit.releaseDate).getFullYear().toString()
                      : ''
                  }
                  genre={credit.genre}
                  imageSrc={
                    buildImageUrl(credit.posterPath, 'w500') || undefined
                  }
                  mediaType={credit.mediaType}
                  className="w-full max-w-none"
                  availability={badges[`${credit.mediaType}-${credit.id}`]}
                  availabilityChecked={`${credit.mediaType}-${credit.id}` in badges}
                />
              </QuickViewLink>
              {/* Role/Job Display */}
              <div className="text-xs text-muted-foreground px-1">
                {activeTab === 'cast' ? (
                  <span className="italic block truncate">
                    as {credit.character || 'Unknown'}
                  </span>
                ) : (
                  <span className="italic block truncate" title={credit.job || credit.department}>
                    {credit.job || credit.department}
                  </span>
                )}
              </div>
            </div>
          ))}

          {sortedCredits.length === 0 && (
            <div className="col-span-full py-12 text-center text-muted-foreground">
              No credits found.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
