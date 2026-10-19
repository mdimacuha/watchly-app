'use client';

import { useMemo } from 'react';
import { QuickViewLink } from '@/components/watchly/QuickViewLink';
import { PosterCard } from '@/components/watchly/PosterCard';
import { useRegionBadges } from '@/components/watchly/useRegionBadges';
import { buildImageUrl } from '@/lib/tmdb';
import type { CollectionPart } from '@/services/tmdb/collection';

/**
 * The collection page's film grid. The page HTML is cached without badges;
 * each film's availability for the visitor's region loads after hydration.
 */
export function CollectionPartsGrid({ parts }: { parts: CollectionPart[] }) {
  const targets = useMemo(
    () =>
      parts.map((p) => ({
        mediaType: 'movie' as const,
        id: p.id,
        title: p.title,
        year: p.releaseDate ? p.releaseDate.slice(0, 4) : null,
      })),
    [parts],
  );
  const badges = useRegionBadges(targets);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
      {parts.map((part) => {
        const key = `movie-${part.id}`;
        return (
          <QuickViewLink key={part.id} mediaType="movie" titleId={part.id}>
            <PosterCard
              title={part.title}
              year={part.releaseDate ? part.releaseDate.split('-')[0] : ''}
              genre="Movie"
              imageSrc={buildImageUrl(part.posterPath, 'w500') || ''}
              className="w-full max-w-none"
              mediaType="movie"
              availability={badges[key]}
              availabilityChecked={key in badges}
            />
          </QuickViewLink>
        );
      })}
    </div>
  );
}
