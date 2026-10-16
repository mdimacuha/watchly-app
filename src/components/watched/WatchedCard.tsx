'use client';

import { QuickViewLink } from '@/components/watchly/QuickViewLink';
import Image from 'next/image';
import { EyeOff, Eye } from 'lucide-react';
import { buildImageUrl } from '@/lib/tmdb';
import type { EnrichedWatched } from '@/services/watched';

interface WatchedCardProps {
  entry: EnrichedWatched;
  /** When provided, renders a "Mark unwatched" button overlay. */
  onUnwatch?: (mediaType: 'movie' | 'tv', mediaId: string) => void;
  pending?: boolean;
}

const TYPE_LABEL: Record<EnrichedWatched['mediaType'], string> = {
  movie: 'Movie',
  tv: 'TV',
};

function titleOf(entry: EnrichedWatched): string {
  return entry.mediaType === 'movie' ? entry.data.title : entry.data.name;
}

function yearOf(entry: EnrichedWatched): string {
  if (entry.mediaType === 'movie') {
    return entry.data.releaseDate?.slice(0, 4) ?? '';
  }
  return entry.data.firstAirDate?.slice(0, 4) ?? '';
}

/**
 * Poster card for the Watched profile tab. Visually matches FavoriteCard
 * (same aspect ratio + hover lift + type badge) so the two grids feel
 * like one product surface, with an Eye icon to disambiguate watched
 * from favorited at a glance. The optional `onUnwatch` button is shown
 * only on the owner's view.
 */
export function WatchedCard({ entry, onUnwatch, pending }: WatchedCardProps) {
  const imageUrl = buildImageUrl(entry.data.posterPath, 'w500');
  const name = titleOf(entry);
  const year = yearOf(entry);

  return (
    <div className="group relative flex flex-col">
      <QuickViewLink
        mediaType={entry.mediaType}
        titleId={entry.mediaId}
        className="relative aspect-[2/3] w-full overflow-hidden rounded-lg bg-card shadow-elevation-card transition-transform duration-300 hover:scale-105"
      >
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={name}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 16vw"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-secondary/30">
            <span className="text-muted-foreground text-xs uppercase tracking-widest font-bold">
              No Image
            </span>
          </div>
        )}

        <div className="absolute top-2 left-2 px-1.5 py-0.5 bg-black/60 backdrop-blur-sm rounded text-[10px] uppercase font-bold text-white tracking-wider">
          {TYPE_LABEL[entry.mediaType]}
        </div>

        {/* "Watched" eye chip — clarifies what list this poster lives in
            when the card sits in a mixed-content surface. */}
        <div className="absolute bottom-2 left-2 inline-flex items-center gap-1 px-1.5 py-0.5 bg-black/60 backdrop-blur-sm rounded text-[10px] font-medium text-white">
          <Eye className="w-3 h-3" />
          Watched
        </div>
      </QuickViewLink>

      {onUnwatch && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!pending) onUnwatch(entry.mediaType, entry.mediaId);
          }}
          disabled={pending}
          className="absolute top-2 right-2 p-2 rounded-full bg-black/40 backdrop-blur-sm text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/60 disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="Mark unwatched"
          title="Mark unwatched"
        >
          <EyeOff className="w-4 h-4" />
        </button>
      )}

      <div className="flex flex-col gap-1 mt-3">
        <h3 className="text-sm font-medium leading-tight truncate text-foreground group-hover:text-primary transition-colors">
          {name}
        </h3>
        {year && (
          <span className="text-xs text-muted-foreground truncate">
            {year}
          </span>
        )}
      </div>
    </div>
  );
}
