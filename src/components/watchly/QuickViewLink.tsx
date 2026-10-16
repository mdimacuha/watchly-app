'use client';

import Link from 'next/link';
import type { ComponentProps } from 'react';
import { useUIStore, type QuickViewType } from '@/client/stores/ui';

type BaseProps = Omit<ComponentProps<typeof Link>, 'href' | 'id'>;

type QuickViewLinkProps = BaseProps &
  (
    | {
        mediaType: QuickViewType;
        /** TMDB id (title or person), or a watchlist's uuid. */
        titleId: string | number;
        href?: never;
      }
    | {
        /**
         * Any app href. Title pages (`/title/{movie|tv}/{id}`) and artist
         * pages (`/artist/{id}`) open Quick View; anything else is a plain
         * link. For rows whose destination is data-driven (activity,
         * notifications, feeds, favorites).
         */
        href: string;
        mediaType?: never;
        titleId?: never;
      }
  );

const TITLE_HREF = /^\/title\/(movie|tv)\/(\d+)\/?$/;
const ARTIST_HREF = /^\/artist\/(\d+)\/?$/;
const WATCHLIST_HREF = /^\/watchlists\/([0-9a-f-]{36})\/?$/i;

/** Full-page path for a Quick View target. */
export function quickViewPagePath(type: QuickViewType, id: string | number): string {
  if (type === 'person') return `/artist/${id}`;
  if (type === 'watchlist') return `/watchlists/${id}`;
  return `/title/${type}/${id}`;
}

function parseHref(href: string): { mediaType: QuickViewType; id: string } | null {
  const path = href.split(/[?#]/)[0];
  const title = TITLE_HREF.exec(path);
  if (title) return { mediaType: title[1] as 'movie' | 'tv', id: title[2] };
  const artist = ARTIST_HREF.exec(path);
  if (artist) return { mediaType: 'person', id: artist[1] };
  const watchlist = WATCHLIST_HREF.exec(path);
  if (watchlist) return { mediaType: 'watchlist', id: watchlist[1] };
  return null;
}

/**
 * Drop-in for a title/artist-page `<Link>` that opens the global Quick View
 * popup on a plain click — inspect without leaving the page. Keeps a real
 * href, so Ctrl/Cmd/Shift/middle-click still open the full page (new
 * tab/window) and crawlers/screen readers see a link.
 */
export function QuickViewLink({ mediaType, titleId, href, onClick, ...props }: QuickViewLinkProps) {
  const openQuickView = useUIStore((s) => s.openQuickView);

  const target = mediaType
    ? { mediaType, id: String(titleId) }
    : parseHref(href ?? '');

  return (
    <Link
      {...props}
      href={target ? quickViewPagePath(target.mediaType, target.id) : (href ?? '/')}
      onClick={(e) => {
        onClick?.(e);
        if (
          !target ||
          e.defaultPrevented ||
          e.button !== 0 ||
          e.metaKey ||
          e.ctrlKey ||
          e.shiftKey ||
          e.altKey
        ) {
          return;
        }
        e.preventDefault();
        openQuickView(target.mediaType, target.id);
      }}
    />
  );
}
