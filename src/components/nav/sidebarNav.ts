import {
  ArrowLeftRight,
  Bookmark,
  CalendarDays,
  Compass,
  Heart,
  MonitorPlay,
  Ticket,
  User,
  type LucideIcon,
} from 'lucide-react';
import { PATHS } from '@/lib/app';
import type { StatusPillKind } from '@/components/watchly/StatusPill';

/**
 * The sidebar's two trees. Discover (search is its home) holds the ways to
 * find something; My Profile holds what you've kept.
 */

export interface NavNode {
  id: string;
  href: string;
  label: string;
  icon: LucideIcon;
  pill?: StatusPillKind;
  /** Other path prefixes that count as being here. */
  match?: string[];
}

export interface NavGroup {
  parent: NavNode;
  children: NavNode[];
}

export const DISCOVER: NavGroup = {
  parent: {
    id: 'discover',
    href: PATHS.DISCOVER,
    label: 'Discover',
    icon: Compass,
    // Browsing out of search lands on these.
    match: ['/title', '/tv', '/collection', '/artist'],
  },
  children: [
    { id: 'for-you', href: PATHS.FOR_YOU, label: 'For You', icon: MonitorPlay, pill: 'beta' },
    { id: 'programme', href: PATHS.PROGRAMME, label: "Tonight's Programme", icon: Ticket },
    { id: 'swipe', href: PATHS.SWIPE, label: 'Swipe', icon: ArrowLeftRight },
    { id: 'new', href: PATHS.NEW, label: 'New & Coming Soon', icon: CalendarDays },
  ],
};

export const PROFILE: NavGroup = {
  parent: { id: 'me', href: PATHS.ME, label: 'My Profile', icon: User },
  children: [
    { id: 'watchlists', href: PATHS.WATCHLISTS, label: 'Watchlists', icon: Bookmark },
    { id: 'favorites', href: PATHS.FAVORITES, label: 'Favorites', icon: Heart },
  ],
};

/** The node whose href (or match) is the longest prefix of the path. */
export function activeNavId(pathname: string): string | null {
  let best: { id: string; len: number } | null = null;
  for (const group of [DISCOVER, PROFILE]) {
    for (const n of [group.parent, ...group.children]) {
      for (const p of [n.href, ...(n.match ?? [])]) {
        if ((pathname === p || pathname.startsWith(`${p}/`)) && (!best || p.length > best.len)) {
          best = { id: n.id, len: p.length };
        }
      }
    }
  }
  return best?.id ?? null;
}
