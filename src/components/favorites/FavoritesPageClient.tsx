'use client';

import { useMemo, useState } from 'react';
import { Heart, Search } from 'lucide-react';
import Link from 'next/link';
import { FilterBar } from '@/components/watchly/FilterBar';
import { EmptyState } from '@/components/watchly/EmptyState';
import { FavoriteCard } from './FavoriteCard';
import { toggleFavoriteAction } from '@/actions/favorites';
import { useToast } from '@/hooks/useToast';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { EnrichedFavorite } from '@/services/favorites/enrich';

const FILTER_OPTIONS = [
  { id: 'all', label: 'All' },
  { id: 'movie', label: 'Movies' },
  { id: 'tv', label: 'TV Shows' },
  { id: 'collection', label: 'Collections' },
  { id: 'artist', label: 'Artists' },
];

const FILTER_LABELS: Record<string, string> = {
  movie: 'movies',
  tv: 'TV shows',
  collection: 'collections',
  artist: 'artists',
};

type SortOption = 'recent' | 'alpha';

function favoriteName(f: EnrichedFavorite): string {
  return f.type === 'movie' ? f.data.title : f.data.name;
}

interface FavoritesPageClientProps {
  favorites: EnrichedFavorite[];
}

export function FavoritesPageClient({ favorites }: FavoritesPageClientProps) {
  const [activeFilter, setActiveFilter] = useState('all');
  const [sortBy, setSortBy] = useState<SortOption>('recent');
  const [localFavorites, setLocalFavorites] = useState(favorites);
  const toast = useToast();

  const visible = useMemo(() => {
    const filteredList =
      activeFilter === 'all'
        ? localFavorites
        : localFavorites.filter((f) => f.type === activeFilter);

    const sorted = [...filteredList];
    if (sortBy === 'alpha') {
      sorted.sort((a, b) => favoriteName(a).localeCompare(favoriteName(b)));
    } else {
      // Recently added — ISO strings compare lexically as dates.
      sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
    return sorted;
  }, [activeFilter, sortBy, localFavorites]);

  const handleRemove = async (
    favoriteId: string,
    type: EnrichedFavorite['type']
  ) => {
    const previous = localFavorites;
    setLocalFavorites((prev) =>
      prev.filter((f) => !(f.favoriteId === favoriteId && f.type === type))
    );

    try {
      await toggleFavoriteAction(favoriteId, type, true, '/favorites');
      toast.success(
        'Removed from favorites',
        'Item has been removed from your favorites.'
      );
    } catch {
      setLocalFavorites(previous);
      toast.error(
        'Action failed',
        'Could not remove from favorites. Please try again.'
      );
    }
  };

  if (localFavorites.length === 0) {
    return (
      <EmptyState
        icon={Heart}
        title="No favorites yet"
        description="Start exploring and add movies, shows, collections, or artists to your favorites."
        action={
          <Link href="/search">
            <Button>
              <Search className="w-4 h-4 mr-2" />
              Explore
            </Button>
          </Link>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <FilterBar
          filters={FILTER_OPTIONS}
          activeFilterId={activeFilter}
          onSelect={setActiveFilter}
          className="flex-1 min-w-0"
        />
        <Select
          value={sortBy}
          onValueChange={(v) => setSortBy(v as SortOption)}
        >
          <SelectTrigger className="w-[180px] shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">Recently added</SelectItem>
            <SelectItem value="alpha">A → Z</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={Heart}
          title={`No ${FILTER_LABELS[activeFilter] ?? 'items'} in favorites`}
          description="Try selecting a different filter or add some from search."
        />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
          {visible.map((favorite) => (
            <FavoriteCard
              key={`${favorite.type}-${favorite.favoriteId}`}
              favorite={favorite}
              onRemove={handleRemove}
            />
          ))}
        </div>
      )}
    </div>
  );
}
