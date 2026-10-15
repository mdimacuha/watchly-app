"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';
import { Heart } from 'lucide-react';
import Image from 'next/image';
import { ProviderBadge } from '@/components/ui/ProviderBadge';

export interface PosterCardProps {
  title: string;
  year: string;
  genre: string;
  imageSrc?: string; // Optional for placeholder behavior
  availability?: Array<{ provider_name: string; logo_path?: string | null }>;
  isFavorite?: boolean;
  onFavoriteToggle?: () => void;
  onClick?: () => void;
  className?: string;
  mediaType?: 'movie' | 'tv';
}

export function PosterCard({
  title,
  year,
  genre,
  imageSrc,
  availability,
  isFavorite,
  onFavoriteToggle,
  onClick,
  className,
  mediaType,
}: PosterCardProps) {
  return (
    <div
      className={cn(
        'group w-full max-w-[200px] flex flex-col gap-3',
        className
      )}
    >
      <motion.div
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.98 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="relative aspect-2/3 w-full rounded-lg bg-card overflow-hidden shadow-elevation-card cursor-pointer group-focus-within:ring-2 group-focus-within:ring-primary group-focus-within:ring-offset-2 group-focus-within:ring-offset-background"
        onClick={onClick}
        tabIndex={0}
      >
        {imageSrc ? (
          <Image
            src={imageSrc}
            alt={title}
            className="h-full w-full object-cover"
            width={200}
            height={300}
          />
        ) : (
          <div className="h-full w-full bg-secondary/30 flex items-center justify-center relative">
            <div className="absolute inset-0 bg-linear-to-t from-black/80 to-transparent opacity-60" />
            <span className="text-muted-foreground text-xs uppercase tracking-widest font-bold z-10">
              Poster
            </span>
          </div>
        )}

        {/* Media Type Badge (Top Right) */}
        {mediaType && (
          <div className="absolute top-2 right-2 px-1.5 py-0.5 bg-black/60 backdrop-blur-sm rounded text-[10px] uppercase font-bold text-white tracking-wider">
            {mediaType === 'movie' ? 'Movie' : 'TV'}
          </div>
        )}

        {/* Hover Overlay */}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center pointer-events-none">
          {/* Content for hover overlay if any (currently empty except for favorite button which is separate) */}
        </div>

        {/* Availability Badges (Bottom Right - Always Visible) */}
        {availability && availability.length > 0 && (
          <div className="absolute bottom-2 right-2 flex gap-1 flex-wrap justify-end max-w-full px-2 z-10">
            {availability.slice(0, 2).map((badge, i) => (
              <ProviderBadge
                key={i}
                label={badge.provider_name}
                logoPath={badge.logo_path}
                size="sm"
                className="text-[8px] px-1 py-0.5 shadow-md"
              />
            ))}
            {availability.length > 2 && (
              <div className="rounded-full flex items-center justify-center font-bold tracking-wider uppercase bg-black/60 backdrop-blur-sm border border-white/20 text-white px-1.5 py-0.5 text-[8px] shadow-md">
                +{availability.length - 2} More
              </div>
            )}
          </div>
        )}

        {/* Favorite Button (Visible on Hover/Active) */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onFavoriteToggle?.();
          }}
          className={cn(
            'absolute top-2 right-2 p-2 rounded-full bg-black/40 backdrop-blur-sm transition-all duration-200',
            isFavorite
              ? 'opacity-100 text-primary'
              : 'opacity-0 group-hover:opacity-100 text-white hover:text-primary hover:bg-black/60'
          )}
          aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
        >
          <Heart className={cn('w-4 h-4', isFavorite && 'fill-current')} />
        </button>
      </motion.div>

      <div className="flex flex-col gap-1">
        <h3 className="text-body-lg font-medium leading-tight truncate text-foreground group-hover:text-primary transition-colors">
          {title}
        </h3>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{year}</span>
          <span className="w-1 h-1 rounded-full bg-muted-foreground/40" />
          <span className="truncate">{genre}</span>
        </div>
      </div>
    </div>
  );
}
