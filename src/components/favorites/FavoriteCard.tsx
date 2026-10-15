'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Heart } from 'lucide-react';
import { cn } from '@/lib/cn';
import { buildImageUrl } from '@/lib/tmdb';
import type { EnrichedFavorite } from '@/services/favorites/enrich';

interface FavoriteCardProps {
  favorite: EnrichedFavorite;
  /** If provided, a remove (heart) button is rendered. */
  onRemove?: (favoriteId: string, type: EnrichedFavorite['type']) => void;
}

const TYPE_LABELS: Record<EnrichedFavorite['type'], string> = {
  movie: 'Movie',
  tv: 'TV',
  collection: 'Collection',
  artist: 'Artist',
};

const TYPE_LINKS: Record<EnrichedFavorite['type'], string> = {
  movie: '/title/movie',
  tv: '/title/tv',
  collection: '/collection',
  artist: '/artist',
};

function getImagePath(favorite: EnrichedFavorite): string | null {
  if (favorite.type === 'artist') return favorite.data.profilePath;
  return favorite.data.posterPath;
}

function getName(favorite: EnrichedFavorite): string {
  if (favorite.type === 'movie') return favorite.data.title;
  return favorite.data.name;
}

function getSubtitle(favorite: EnrichedFavorite): string {
  switch (favorite.type) {
    case 'movie':
      return favorite.data.releaseDate?.slice(0, 4) ?? '';
    case 'tv':
      return favorite.data.firstAirDate?.slice(0, 4) ?? '';
    case 'collection':
      return 'Collection';
    case 'artist':
      return favorite.data.knownForDepartment ?? '';
  }
}

export function FavoriteCard({ favorite, onRemove }: FavoriteCardProps) {
  const imagePath = getImagePath(favorite);
  const imageUrl = buildImageUrl(imagePath, 'w342');
  const name = getName(favorite);
  const subtitle = getSubtitle(favorite);
  const href = `${TYPE_LINKS[favorite.type]}/${favorite.data.id}`;

  return (
    <div className="group relative flex flex-col">
      <Link
        href={href}
        className="relative aspect-2/3 w-full overflow-hidden rounded-lg bg-card shadow-elevation-card transition-transform duration-300 hover:scale-105"
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

        {/* Type badge */}
        <div className="absolute top-2 left-2 px-1.5 py-0.5 bg-black/60 backdrop-blur-sm rounded text-[10px] uppercase font-bold text-white tracking-wider">
          {TYPE_LABELS[favorite.type]}
        </div>
      </Link>

      {/* Remove button (only when onRemove is provided) */}
      {onRemove && (
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRemove(favorite.favoriteId, favorite.type);
          }}
          className={cn(
            'absolute top-2 right-2 p-2 rounded-full bg-black/40 backdrop-blur-sm transition-all duration-200',
            'text-primary opacity-100 hover:bg-black/60'
          )}
          aria-label="Remove from favorites"
        >
          <Heart className="w-4 h-4 fill-current" />
        </button>
      )}

      {/* Info below poster */}
      <div className="flex flex-col gap-1 mt-3">
        <h3 className="text-sm font-medium leading-tight truncate text-foreground group-hover:text-primary transition-colors">
          {name}
        </h3>
        {subtitle && (
          <span className="text-xs text-muted-foreground truncate">
            {subtitle}
          </span>
        )}
      </div>
    </div>
  );
}
