'use client';

import type { ActivityItem } from '@/services/activity/types';
import Image from 'next/image';

interface RightAccessoryProps {
  item: ActivityItem;
}

export function RightAccessory({ item }: RightAccessoryProps) {
  if (
    (item.kind === 'watchlist_add' ||
      item.kind === 'favorite' ||
      item.kind === 'review' ||
      item.kind === 'watchlist_add_aggregated') &&
    item.posterUrl
  ) {
    const alt =
      item.kind === 'watchlist_add_aggregated' ? item.titles[0] : item.title;
    return (
      <div className="hidden sm:block shrink-0 ml-auto pl-3">
        <Image
          src={item.posterUrl}
          alt={alt}
          className="w-11 h-[66px] rounded-md object-cover"
          width={44}
          height={66}
        />
      </div>
    );
  }

  if (item.kind === 'follow' && !item.isFollowingBack) {
    return (
      <div className="shrink-0 ml-auto pl-3">
        <button
          type="button"
          className="text-sm font-medium px-4 py-1.5 rounded-full border border-border hover:bg-white/5 text-foreground transition-colors cursor-pointer"
        >
          Follow Back
        </button>
      </div>
    );
  }

  return null;
}
