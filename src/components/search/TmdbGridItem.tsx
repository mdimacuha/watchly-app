'use client';

import { cn } from '@/lib/cn';
import { SearchResponseItem } from '@/types/tmdb';
import Image from 'next/image';
import { buildImageUrl } from '@/lib/tmdb';
import { QuickViewLink } from '@/components/watchly/QuickViewLink';
import { ProviderBadge } from '@/components/ui/ProviderBadge';
import { NotInRegionPill } from '@/components/ui/NotInRegionPill';
import { cleanProviderName } from '@/utils/providers';
import { useState } from 'react';
import { useAuthStore } from '@/client/stores/auth';
import { SeenItButton, useWatchedKeys } from '@/components/watched/SeenItButton';

interface TmdbGridItemProps {
  item: SearchResponseItem;
  className?: string;
  /** Called when the card is opened (analytics). */
  onOpen?: () => void;
}

const MAX_VISIBLE_BADGES = 3;

export function TmdbGridItem({ item, className, onOpen }: TmdbGridItemProps) {
  const imageUrl = buildImageUrl(item.posterPath, 'w342');
  const isAuthenticated = useAuthStore((st) => st.status === 'authenticated');
  // One shared fetch for every card on the page (cachedLoad dedupes).
  const watchedKeys = useWatchedKeys(isAuthenticated);
  const key = `${item.mediaType}:${item.id}`;
  // Set once this card's button logs/removes a watch.
  const [seen, setSeen] = useState<boolean | undefined>(undefined);

  // Normalize + dedupe so "Amazon Prime Video" and "Amazon Prime Video With
  // Ads" collapse to a single "Prime Video" pill on the card.
  const cleanedBadges = dedupeBadges(item.providerBadges);
  const visible = cleanedBadges.slice(0, MAX_VISIBLE_BADGES);
  const overflow = Math.max(0, cleanedBadges.length - MAX_VISIBLE_BADGES);
  // Only when providers were actually looked up for the user's region.
  const notInRegion = item.availabilityChecked === true && visible.length === 0;

  return (
    <div className={cn('group/card relative flex flex-col', className)}>
    <QuickViewLink
      mediaType={item.mediaType}
      titleId={item.id}
      onClick={onOpen}
      className="group relative flex flex-1 flex-col rounded-md overflow-hidden bg-muted/20 hover:bg-muted/40 transition-colors cursor-pointer"
    >
      <div className="relative aspect-2/3 w-full overflow-hidden rounded-md bg-muted">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={item.title}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 20vw"
          />
        ) : (
          // Typeset stand-in instead of a bare "No Poster" tile.
          <div className="flex h-full flex-col justify-end gap-1 bg-secondary p-3">
            <span className="text-base font-bold leading-tight text-foreground line-clamp-4">
              {item.title}
            </span>
            {item.year && <span className="text-xs text-muted-foreground">{item.year}</span>}
          </div>
        )}

        {/* Type Badge — stays visible since it indicates media kind, not availability. */}
        <div className="absolute top-2 right-2 px-1.5 py-0.5 bg-black/60 backdrop-blur-sm rounded text-[10px] uppercase font-bold text-white tracking-wider">
          {item.mediaType === 'movie' ? 'Movie' : 'TV'}
        </div>

        {/* Provider strip — slides up from the bottom of the poster on hover. */}
        {(visible.length > 0 || notInRegion) && (
          <div
            className={cn(
              'absolute inset-x-0 bottom-0 pointer-events-none',
              'translate-y-full opacity-0',
              'group-hover:translate-y-0 group-hover:opacity-100',
              'group-focus-visible:translate-y-0 group-focus-visible:opacity-100',
              'transition-all duration-300 ease-out',
            )}
          >
            <div className="bg-linear-to-t from-black/90 via-black/70 to-transparent px-2 pt-6 pb-2 flex flex-wrap gap-1 justify-end items-end">
              {visible.map((badge, i) => (
                <ProviderBadge
                  key={`${badge.label}-${i}`}
                  label={badge.label}
                  size="sm"
                  className="text-[9px] px-1.5 py-0.5"
                />
              ))}
              {overflow > 0 && (
                <span className="rounded-full font-bold tracking-wider uppercase bg-white/10 backdrop-blur-sm border border-white/20 text-white px-1.5 py-0.5 text-[9px]">
                  +{overflow}
                </span>
              )}
              {notInRegion && <NotInRegionPill className="text-[9px]" />}
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col p-3 space-y-1">
        <h3 className="text-sm font-semibold leading-tight line-clamp-1 text-foreground">
          {item.title}
        </h3>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          {item.year && <span>{item.year}</span>}
        </div>
      </div>
    </QuickViewLink>
    {/* Seen it: outside the Quick View link. Seen titles keep a filled
        badge; the rest show the button on hover/focus (always on touch). */}
    {isAuthenticated && watchedKeys && (
      <div
        className={cn(
          'absolute left-2 top-2 z-10 transition-opacity',
          !(seen ?? watchedKeys.has(key)) &&
            'opacity-0 group-hover/card:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100',
        )}
      >
        <SeenItButton
          mediaType={item.mediaType}
          mediaId={String(item.id)}
          title={item.title}
          posterPath={item.posterPath}
          year={item.year ?? null}
          variant="icon"
          surface="search"
          knownWatched={watchedKeys.has(key)}
          onWatchedChange={setSeen}
        />
      </div>
    )}
    </div>
  );
}

interface CleanedBadge {
  label: string;
}

function dedupeBadges(
  badges: { provider_name: string }[],
): CleanedBadge[] {
  const seen = new Set<string>();
  const out: CleanedBadge[] = [];
  for (const b of badges) {
    const label = cleanProviderName(b.provider_name);
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ label });
  }
  return out;
}
