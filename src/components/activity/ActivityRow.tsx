import Link from 'next/link';
import Image from 'next/image';
import type { ActivityItem } from '@/services/activity/types';
import { ActivityAvatar } from './ActivityAvatar';
import { RightAccessory } from './RightAccessory';
import { formatRelativeTime } from './time';
import { cn } from '@/lib/cn';

interface ActivityRowProps {
  item: ActivityItem;
}

/** Human-friendly join: "A and B" / "A, B, and C" / "A, B, C, and N more". */
function formatTitleList(titles: string[]): string {
  if (titles.length === 0) return '';
  if (titles.length === 1) return titles[0];
  if (titles.length === 2) return `${titles[0]} and ${titles[1]}`;
  if (titles.length === 3) return `${titles[0]}, ${titles[1]}, and ${titles[2]}`;
  const shown = titles.slice(0, 3).join(', ');
  const remaining = titles.length - 3;
  return `${shown}, and ${remaining} more`;
}

function ActivityMessage({ item }: { item: ActivityItem }) {
  switch (item.kind) {
    case 'watchlist_add':
      return (
        <p className="text-sm text-muted-foreground leading-relaxed">
          <span className="text-foreground font-medium">{item.actor.name}</span>{' '}
          added {item.title} to the {item.targetWatchlistName} watchlist.
        </p>
      );
    case 'watchlist_bulk_add':
      return (
        <p className="text-sm text-muted-foreground leading-relaxed">
          <span className="text-foreground font-medium">{item.actor.name}</span>{' '}
          added {item.count} {item.count === 1 ? 'title' : 'titles'} to the{' '}
          {item.targetWatchlistName} watchlist.
        </p>
      );
    case 'watchlist_add_aggregated':
      return (
        <p className="text-sm text-muted-foreground leading-relaxed">
          <span className="text-foreground font-medium">{item.actor.name}</span>{' '}
          added {formatTitleList(item.titles)} to the {item.targetWatchlistName}{' '}
          watchlist.
        </p>
      );
    case 'favorite':
      return (
        <p className="text-sm text-muted-foreground leading-relaxed">
          <span className="text-foreground font-medium">{item.actor.name}</span>{' '}
          favorited {item.title}.
        </p>
      );
    case 'review':
      return (
        <p className="text-sm text-muted-foreground leading-relaxed">
          <span className="text-foreground font-medium">{item.actor.name}</span>{' '}
          reviewed {item.title}
          {item.rating > 0 && (
            <span className="text-foreground font-medium"> (★ {item.rating}/5)</span>
          )}
          .
        </p>
      );
    case 'watchlist_create':
      return (
        <p className="text-sm text-muted-foreground leading-relaxed">
          <span className="text-foreground font-medium">{item.actor.name}</span>{' '}
          created a new watchlist {item.watchlistName}.
        </p>
      );
    case 'follow':
      return (
        <p className="text-sm text-muted-foreground leading-relaxed">
          <span className="text-foreground font-medium">{item.actor.name}</span>{' '}
          started following you.
        </p>
      );
    case 'region_update':
      return (
        <p className="text-sm text-muted-foreground leading-relaxed">
          Your region was updated to{' '}
          <span className="text-foreground font-medium">{item.regionName}</span>.
        </p>
      );
  }
}

export function ActivityRow({ item }: ActivityRowProps) {
  const isActor = item.kind !== 'region_update';

  const avatarAndContent = (
    <>
      {/* Avatar with unread indicator (dot aligned to avatar center) */}
      <div className="relative shrink-0">
        {!item.isRead && (
          <span className="absolute -left-4 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-primary" />
        )}
        {isActor ? (
          <ActivityAvatar name={item.actor.name} avatarUrl={item.actor.avatarUrl} />
        ) : (
          <ActivityAvatar system />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 pt-0.5">
        <ActivityMessage item={item} />
        <span className="text-xs text-muted-foreground/70 mt-1 block">
          {formatRelativeTime(item.createdAt)}
        </span>
      </div>
    </>
  );

  const baseClass = 'flex items-start gap-3 py-4';
  const hoverClass =
    '-mx-2 px-2 rounded-md hover:bg-foreground/5 transition-colors';

  // Aggregated rows get a split-nav layout: the left/main region links to
  // the watchlist, the poster thumb links to the first title. Nested <a>s
  // aren't allowed in HTML, so the wrapper is a plain <div> with two
  // sibling <Link>s instead of one outer <Link>.
  if (
    item.kind === 'watchlist_add_aggregated' &&
    item.href &&
    item.posterHref &&
    item.posterUrl
  ) {
    return (
      <div className={cn(baseClass, '-mx-2 px-2')}>
        <Link
          href={item.href}
          className="flex-1 min-w-0 flex items-start gap-3 rounded-md hover:bg-foreground/5 transition-colors -mx-2 px-2 py-0.5 -my-0.5"
        >
          {avatarAndContent}
        </Link>
        <Link
          href={item.posterHref}
          className="hidden sm:block shrink-0 ml-3 rounded-md overflow-hidden hover:opacity-80 transition-opacity"
          aria-label={`Go to ${item.titles[0]}`}
        >
          <Image
            src={item.posterUrl}
            alt={item.titles[0]}
            className="w-11 h-[66px] object-cover"
            width={44}
            height={66}
          />
        </Link>
      </div>
    );
  }

  const inner = (
    <>
      {avatarAndContent}
      {/* Right accessory */}
      <RightAccessory item={item} />
    </>
  );

  if (item.href) {
    return (
      <Link href={item.href} className={cn(baseClass, hoverClass)}>
        {inner}
      </Link>
    );
  }

  return <div className={baseClass}>{inner}</div>;
}
