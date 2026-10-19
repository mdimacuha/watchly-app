import Image from 'next/image';
import { cn } from '@/lib/cn';
import { buildImageUrl } from '@/lib/tmdb';
import { ProviderBadge } from '@/components/ui/ProviderBadge';
import { NotInRegionPill } from '@/components/ui/NotInRegionPill';
import { FavoriteButton } from '@/components/watchly/FavoriteButton';
import { QuickViewLink } from '@/components/watchly/QuickViewLink';
import { AddToWatchlistButton } from '@/components/watchlists/AddToWatchlistButton';
import type { ForYouCandidate, ForYouProvider } from '@/services/forYou';

interface ForYouCardProps {
  item: ForYouCandidate;
  className?: string;
}

const MAX_VISIBLE_BADGES = 3;

/**
 * Mirrors the search page's TmdbGridItem visual style so cards across the
 * app feel uniform: type badge top-right, hover-revealed provider strip
 * at the bottom. Only divergence from the search card is the optional
 * `subtitle` line (used by For You rows like "Up Next — Added 2d ago").
 */
export function ForYouCard({ item, className }: ForYouCardProps) {
  const imageUrl = buildImageUrl(item.posterPath, 'w500');

  const visible = item.providers.slice(0, MAX_VISIBLE_BADGES);
  const overflow = Math.max(0, item.providers.length - MAX_VISIBLE_BADGES);
  const notInRegion = item.availabilityChecked === true && visible.length === 0;
  const idStr = String(item.tmdbId);

  return (
    // Outer is a plain container (not a <Link>) so the quick-action <button>s
    // aren't nested inside an <a> (invalid HTML). Navigation is handled by
    // stretched links layered under the actions.
    <div
      className={cn(
        // Fixed width keeps the card aligned inside a horizontal snap-scroll
        // row. Outer styling matches TmdbGridItem otherwise.
        'group relative flex flex-col rounded-md overflow-hidden bg-muted/20 hover:bg-muted/40 transition-colors w-[180px] shrink-0 snap-start',
        className,
      )}
    >
      <div className="relative aspect-2/3 w-full overflow-hidden rounded-md bg-muted">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={item.title}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            sizes="180px"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground text-xs p-4 text-center">
            No Poster
          </div>
        )}

        {/* Type Badge — same placement + style as TmdbGridItem. */}
        <div className="absolute top-2 right-2 z-20 px-1.5 py-0.5 bg-black/60 backdrop-blur-sm rounded text-[10px] uppercase font-bold text-white tracking-wider">
          {item.mediaType === 'movie' ? 'Movie' : 'TV'}
        </div>

        {/* Provider strip — slide up on hover/focus. Identical to search. */}
        {(visible.length > 0 || notInRegion) && (
          <div
            className={cn(
              'absolute inset-x-0 bottom-0 z-20 pointer-events-none',
              'translate-y-full opacity-0',
              'group-hover:translate-y-0 group-hover:opacity-100',
              'group-focus-within:translate-y-0 group-focus-within:opacity-100',
              'transition-all duration-300 ease-out',
            )}
          >
            <div className="bg-linear-to-t from-black/90 via-black/70 to-transparent px-2 pt-6 pb-2 flex flex-wrap gap-1 justify-end items-end">
              {visible.map((p: ForYouProvider, i) => (
                <ProviderBadge
                  key={`${p.providerName}-${i}`}
                  providerId={p.providerId}
                  label={p.providerName}
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

        {/* Stretched link — covers the poster and opens Quick View; sits under
            the quick actions so the buttons win the click. */}
        <QuickViewLink
          mediaType={item.mediaType}
          titleId={item.tmdbId}
          aria-label={item.title}
          className="absolute inset-0 z-10"
        />

        {/* Quick actions — revealed on hover/focus, centered over the poster.
            Interactive only when revealed so hidden buttons don't eat clicks. */}
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/45 opacity-0 transition-opacity duration-200 pointer-events-none group-hover:opacity-100 group-focus-within:opacity-100">
          <div className="flex items-center gap-2 pointer-events-none group-hover:pointer-events-auto group-focus-within:pointer-events-auto">
            <FavoriteButton id={item.tmdbId} type={item.mediaType} showText={false} />
            <AddToWatchlistButton
              mediaType={item.mediaType}
              mediaId={idStr}
              title={item.title}
              variant="icon"
            />
          </div>
        </div>
      </div>

      {/* Text row — its own link so clicking the title/year also opens Quick View. */}
      <QuickViewLink
        mediaType={item.mediaType}
        titleId={item.tmdbId}
        className="flex flex-col p-3 space-y-1"
      >
        <h3 className="text-sm font-semibold leading-tight line-clamp-1 text-foreground">
          {item.title}
        </h3>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          {item.year && <span>{item.year}</span>}
        </div>
        {/* For You–specific subtitle slot — preserved alongside the search-
            matched header so contextual info like "Added 2d ago" still has
            a home without breaking visual parity. */}
        {item.subtitle && (
          <span className="text-[11px] text-muted-foreground/70 line-clamp-1">
            {item.subtitle}
          </span>
        )}
      </QuickViewLink>
    </div>
  );
}
