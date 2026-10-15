'use client';

import React from 'react';
import { cn } from '@/lib/cn';
import { Share2, Play } from 'lucide-react';
import { shareTitle } from '@/lib/share';
import { TmdbVideo } from '@/server/tmdb/types';
import { Button } from '@/components/ui/button';
import { FavoriteButton } from '../watchly/FavoriteButton';
import { AddToWatchlistButton } from '@/components/watchlists/AddToWatchlistButton';
import { useAuthStore } from '@/client/stores/auth';

interface TitleActionsProps {
  trailer: TmdbVideo | null;
  className?: string;
  onWatchTrailer?: () => void;
  mediaType: string;
  id: string;
  title: string;
}

export function TitleActions({
  trailer,
  className,
  onWatchTrailer,
  mediaType,
  id,
  title,
}: TitleActionsProps) {
  const isAuthenticated = useAuthStore((s) => s.status === 'authenticated');
  const isWatchable = mediaType === 'movie' || mediaType === 'tv';

  const handleShare = () => {
    const type = isWatchable ? (mediaType as 'movie' | 'tv') : 'movie';
    shareTitle(type, id, title);
  };

  return (
    <div className={cn('flex items-center gap-3', className)}>
      {isAuthenticated && (
        <>
          {isWatchable && (
            <AddToWatchlistButton
              mediaType={mediaType as 'movie' | 'tv'}
              mediaId={id}
              title={title}
              fetchInitial
            />
          )}

          <FavoriteButton
            key={id}
            id={id}
            type={mediaType as 'movie' | 'tv'}
            className="w-full md:w-auto"
            showText={true}
            fetchInitial
          />
        </>
      )}

      <Button
        variant="secondary"
        size="icon"
        onClick={handleShare}
        aria-label="Share"
      >
        <Share2 className="w-5 h-5" />
      </Button>

      {trailer && (
        <Button
          variant="secondary"
          onClick={onWatchTrailer}
          className="ml-auto sm:ml-0 gap-2"
        >
          <Play className="w-4 h-4" />
          <span>Watch Trailer</span>
        </Button>
      )}
    </div>
  );
}
