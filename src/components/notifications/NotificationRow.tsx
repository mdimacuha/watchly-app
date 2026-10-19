import { QuickViewLink } from '@/components/watchly/QuickViewLink';
import Image from 'next/image';
import { cn } from '@/lib/cn';
import { UserAvatar } from '@/components/ui/user-avatar';
import { formatRelativeAgo } from '@/lib/format';
import { getCountryName } from '@/lib/regions/countries';
import type { NotificationItem } from '@/services/notifications';
import type { TitleAlertNotification } from '@/services/notifications/getNotifications';

interface NotificationRowProps {
  item: NotificationItem;
}

/**
 * Single notification row. Whole row is a Link to a type-specific
 * destination; the unread dot is a visual cue on the left.
 */
export function NotificationRow({ item }: NotificationRowProps) {
  return (
    <QuickViewLink
      href={item.href}
      className={cn(
        'flex items-start gap-3 px-2 py-3 -mx-2 rounded-md hover:bg-foreground/5 transition-colors',
      )}
    >
      {/* Unread dot — small accent next to the avatar. */}
      <div className="relative shrink-0 pt-0.5">
        {!item.isRead && (
          <span className="absolute -left-3 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-primary" />
        )}
        {item.actor ? (
          <UserAvatar
            avatarUrl={item.actor.avatarUrl}
            firstName={item.actor.displayName.split(' ')[0]}
            lastName={item.actor.displayName.split(' ').slice(1).join(' ')}
            size="md"
          />
        ) : (
          // Title alerts: the poster stands in for the avatar.
          <div className="relative w-10 aspect-2/3 rounded overflow-hidden bg-muted">
            {item.posterUrl && (
              <Image src={item.posterUrl} alt="" fill className="object-cover" sizes="40px" />
            )}
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0 pt-0.5">
        <NotificationMessage item={item} />
        <span className="text-xs text-muted-foreground/70 mt-1 block">
          {formatRelativeAgo(item.createdAt)}
        </span>
      </div>

      {/* Right-side accessory — poster on follow_activity rows. */}
      {item.kind === 'follow_activity' && item.posterUrl && (
        <div className="relative w-10 aspect-2/3 shrink-0 rounded overflow-hidden bg-muted">
          <Image
            src={item.posterUrl}
            alt=""
            fill
            className="object-cover"
            sizes="40px"
          />
        </div>
      )}
    </QuickViewLink>
  );
}

/** "Netflix", "Netflix and Max", "Netflix, Max and 2 more". */
function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? 'a service';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  const rest = names.length - 2;
  return `${names[0]}, ${names[1]} and ${rest === 1 ? names[2] : `${rest} more`}`;
}

function TitleAlertMessage({ item }: { item: TitleAlertNotification }) {
  const title = <span className="text-foreground font-medium">{item.title ?? 'A title you follow'}</span>;
  const where = getCountryName(item.region) || item.region;
  const services = <span className="text-foreground">{joinNames(item.providers)}</span>;
  switch (item.kind) {
    case 'title_available':
      return (
        <p className="text-sm text-muted-foreground leading-relaxed">
          {title} is now streaming on {services}
          {where ? ` in ${where}` : ''}.
        </p>
      );
    case 'title_leaving':
      return (
        <p className="text-sm text-muted-foreground leading-relaxed">
          {title} is no longer on {services}
          {where ? ` in ${where}` : ''}.
        </p>
      );
    case 'title_new_season':
      return (
        <p className="text-sm text-muted-foreground leading-relaxed">
          {item.seasonNumber ? `Season ${item.seasonNumber} of ` : 'A new season of '}
          {title} has started airing.
        </p>
      );
  }
}

function NotificationMessage({ item }: { item: NotificationItem }) {
  if (!item.actor) return <TitleAlertMessage item={item} />;
  const actor = item.actor.displayName;

  switch (item.kind) {
    case 'follow_request':
      return (
        <p className="text-sm text-muted-foreground leading-relaxed">
          <span className="text-foreground font-medium">{actor}</span>{' '}
          requested to follow you.
        </p>
      );
    case 'follow_accepted':
      return (
        <p className="text-sm text-muted-foreground leading-relaxed">
          <span className="text-foreground font-medium">{actor}</span>{' '}
          accepted your follow request.
        </p>
      );
    case 'follow_back':
      return (
        <p className="text-sm text-muted-foreground leading-relaxed">
          <span className="text-foreground font-medium">{actor}</span>{' '}
          started following you.
        </p>
      );
    case 'follow_activity': {
      const noun = item.title ?? 'a title';
      switch (item.activityKind) {
        case 'favorite':
          return (
            <p className="text-sm text-muted-foreground leading-relaxed">
              <span className="text-foreground font-medium">{actor}</span>{' '}
              favorited <span className="text-foreground">{noun}</span>.
            </p>
          );
        case 'watchlist_add':
          return (
            <p className="text-sm text-muted-foreground leading-relaxed">
              <span className="text-foreground font-medium">{actor}</span>{' '}
              added <span className="text-foreground">{noun}</span>
              {item.watchlistName ? (
                <>
                  {' '}to the{' '}
                  <span className="text-foreground">{item.watchlistName}</span>{' '}
                  watchlist
                </>
              ) : null}
              .
            </p>
          );
        case 'watchlist_bulk_add':
          return (
            <p className="text-sm text-muted-foreground leading-relaxed">
              <span className="text-foreground font-medium">{actor}</span>{' '}
              added multiple titles
              {item.watchlistName ? (
                <>
                  {' '}to the{' '}
                  <span className="text-foreground">{item.watchlistName}</span>{' '}
                  watchlist
                </>
              ) : null}
              .
            </p>
          );
        case 'review':
          return (
            <p className="text-sm text-muted-foreground leading-relaxed">
              <span className="text-foreground font-medium">{actor}</span>{' '}
              reviewed <span className="text-foreground">{noun}</span>
              {item.rating ? (
                <>
                  {' '}
                  <span className="text-foreground">{item.rating}★</span>
                </>
              ) : null}
              .
            </p>
          );
        case 'watchlist_create':
          return (
            <p className="text-sm text-muted-foreground leading-relaxed">
              <span className="text-foreground font-medium">{actor}</span>{' '}
              created a new watchlist
              {item.watchlistName ? (
                <>
                  {' '}
                  <span className="text-foreground">{item.watchlistName}</span>
                </>
              ) : null}
              .
            </p>
          );
      }
    }
  }
}
