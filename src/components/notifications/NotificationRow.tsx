import Link from 'next/link';
import Image from 'next/image';
import { cn } from '@/lib/cn';
import { UserAvatar } from '@/components/ui/user-avatar';
import { formatRelativeAgo } from '@/lib/format';
import type { NotificationItem } from '@/services/notifications';

interface NotificationRowProps {
  item: NotificationItem;
}

/**
 * Single notification row. Whole row is a Link to a type-specific
 * destination; the unread dot is a visual cue on the left.
 */
export function NotificationRow({ item }: NotificationRowProps) {
  return (
    <Link
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
        <UserAvatar
          avatarUrl={item.actor.avatarUrl}
          firstName={item.actor.displayName.split(' ')[0]}
          lastName={item.actor.displayName.split(' ').slice(1).join(' ')}
          size="md"
        />
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
    </Link>
  );
}

function NotificationMessage({ item }: { item: NotificationItem }) {
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
