'use client';

import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Heart } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useToast } from '@/hooks/useToast';
import { toggleFavoriteAction, isFavoriteAction } from '@/actions/favorites';
import { usePathname } from 'next/navigation';

interface FavoriteButtonProps {
  id: string | number;
  type: 'artist' | 'movie' | 'tv' | 'collection';
  initialIsFavorite?: boolean;
  /**
   * When true, self-fetch the favorite state on mount instead of relying on
   * `initialIsFavorite`. Used on ISR-cached pages where the server can't pass
   * per-user state. Leave false on server-rendered lists that already seed it.
   */
  fetchInitial?: boolean;
  className?: string;
  showText?: boolean;
}

export function FavoriteButton({
  id,
  type,
  initialIsFavorite = false,
  fetchInitial = false,
  showText = true,
}: FavoriteButtonProps) {
  const [isFavorite, setIsFavorite] = useState(initialIsFavorite);
  const [isLoading, setIsLoading] = useState(false);
  const toast = useToast();
  const pathname = usePathname();

  useEffect(() => {
    if (!fetchInitial) return;
    let cancelled = false;
    isFavoriteAction(id.toString(), type)
      .then((v) => {
        if (!cancelled) setIsFavorite(v);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [fetchInitial, id, type]);

  const toggleFavorite = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (isLoading) return;

    // Optimistic update
    const previousState = isFavorite;
    const newState = !isFavorite;
    setIsFavorite(newState);
    setIsLoading(true);

    const typeLabel = type.charAt(0).toUpperCase() + type.slice(1);
    
    try {
      await toggleFavoriteAction(
        id.toString(), 
        type, 
        previousState,
        pathname
      );

      toast.success(
        newState ? 'Added to favorites' : 'Removed from favorites',
        `${typeLabel} has been ${newState ? 'added to' : 'removed from'} your favorites.`
      );
    } catch (error) {
      // Revert on failure
      setIsFavorite(previousState);
      toast.error(
        'Action failed',
        `Could not ${newState ? 'add to' : 'remove from'} favorites. Please try again.`
      );
      console.error('Failed to toggle favorite:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      variant="secondary"
      size={showText ? "default" : "icon"}
      onClick={toggleFavorite}
      disabled={isLoading}
      aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
      title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
      className={cn(showText && 'gap-2')}
    >
      <Heart className={cn('w-5 h-5 transition-colors', isFavorite && 'fill-primary text-primary')} />
      {showText && <span>{isFavorite ? 'Favorited' : `Add to Favorites`}</span>}
    </Button>
  );
}
