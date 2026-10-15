export type ActivityGroupLabel = 'TODAY' | 'YESTERDAY' | 'THIS WEEK' | 'OLDER';

export type ActivityBase = {
  id: string;
  createdAt: string;
  group: ActivityGroupLabel;
  isRead: boolean;
  /** Where clicking the row should navigate. Undefined = not clickable. */
  href?: string;
};

export type ActivityItem =
  | (ActivityBase & {
      kind: 'watchlist_add';
      actor: { name: string; avatarUrl: string };
      title: string;
      targetWatchlistName: string;
      posterUrl?: string;
    })
  | (ActivityBase & {
      kind: 'watchlist_bulk_add';
      actor: { name: string; avatarUrl: string };
      count: number;
      targetWatchlistName: string;
    })
  | (ActivityBase & {
      kind: 'watchlist_add_aggregated';
      actor: { name: string; avatarUrl: string };
      titles: string[];
      count: number;
      targetWatchlistName: string;
      posterUrl?: string;
      /**
       * Where the poster thumbnail navigates. Distinct from `href` (the
       * watchlist) so the row supports split-nav: poster → first title,
       * rest of row → watchlist detail page.
       */
      posterHref?: string;
    })
  | (ActivityBase & {
      kind: 'favorite';
      actor: { name: string; avatarUrl: string };
      title: string;
      posterUrl?: string;
    })
  | (ActivityBase & {
      kind: 'review';
      actor: { name: string; avatarUrl: string };
      title: string;
      /** 1–5 star rating the user gave. */
      rating: number;
      posterUrl?: string;
    })
  | (ActivityBase & {
      kind: 'watchlist_create';
      actor: { name: string; avatarUrl: string };
      watchlistName: string;
    })
  | (ActivityBase & {
      kind: 'follow';
      actor: { name: string; avatarUrl: string };
      isFollowingBack: boolean;
    })
  | (ActivityBase & {
      kind: 'region_update';
      regionName: string;
    });

export type ActivityResponse = {
  items: ActivityItem[];
};
