'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ListVideo, Star, StarHalf } from 'lucide-react';
import { QuickViewLink } from '@/components/watchly/QuickViewLink';
import { UserAvatar } from '@/components/ui/user-avatar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { formatRelativeAgo } from '@/lib/format';
import { getCountryName } from '@/lib/regions/countries';
import { useToast } from '@/hooks/useToast';
import { acceptFollowRequestAction, rejectFollowRequestAction } from '@/actions/social';
import type {
  ActivityTitle,
  FollowActivityNotification,
  NotificationItem,
  TitleAlertNotification,
} from '@/services/notifications/getNotifications';

/**
 * One notification. The whole row opens its destination (a stretched link
 * under the content); the person's avatar and name, posters and the
 * follow-request buttons sit above it as their own targets.
 */
export function NotificationRow({ item, onOpen, onAnswer }: {
  item: NotificationItem;
  /** Analytics: the row (or a poster in it) was opened. */
  onOpen: (item: NotificationItem) => void;
  /** Analytics: a follow request was answered from the row. */
  onAnswer: (answer: 'accepted' | 'declined') => void;
}) {
  const strip = item.kind === 'follow_activity' && item.total > 1 ? item.titles : null;

  return (
    <li className="relative flex items-start gap-3 rounded-lg px-3 py-3 transition-colors hover:bg-foreground/5">
      <QuickViewLink
        href={item.href}
        onClick={() => onOpen(item)}
        aria-label={plainText(item)}
        className="absolute inset-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />

      <div className="relative shrink-0">
        {!item.isRead && (
          <span aria-hidden className="absolute -left-2.5 top-4 h-1.5 w-1.5 rounded-full bg-primary" />
        )}
        {item.actor ? (
          <Link
            href={`/user/${item.actor.username}`}
            className="relative z-10 block rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`${item.actor.displayName}'s profile`}
          >
            <UserAvatar
              avatarUrl={item.actor.avatarUrl}
              firstName={item.actor.displayName.split(' ')[0]}
              lastName={item.actor.displayName.split(' ').slice(1).join(' ')}
              size="md"
            />
          </Link>
        ) : (
          // Title alerts: the poster stands in for the avatar.
          <Poster src={item.posterUrl} className="w-10" />
        )}
      </div>

      <div className="min-w-0 flex-1 pt-0.5">
        <Message item={item} onAnswer={onAnswer} />
        {strip && <PosterStrip titles={strip} total={item.kind === 'follow_activity' ? item.total : 0} onOpen={() => onOpen(item)} />}
        <span className="mt-1 block text-xs text-muted-foreground/80">
          {formatRelativeAgo(item.createdAt)}
        </span>
      </div>

      <Accessory item={item} />
    </li>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function Poster({ src, className, round }: { src: string | null; className?: string; round?: boolean }) {
  return (
    <span className={cn('relative block shrink-0 overflow-hidden bg-muted', round ? 'aspect-square rounded-full' : 'aspect-2/3 rounded', className)}>
      {src && <Image src={src} alt="" fill className="object-cover" sizes="48px" />}
    </span>
  );
}

/** Up to four posters of a group, each opening its title, and "+N" for the rest. */
function PosterStrip({ titles, total, onOpen }: { titles: ActivityTitle[]; total: number; onOpen: () => void }) {
  const rest = total - titles.length;
  return (
    <ul className="mt-2 flex items-center gap-1.5">
      {titles.map((t) => (
        <li key={t.key}>
          {t.href ? (
            <QuickViewLink
              href={t.href}
              onClick={onOpen}
              title={t.name ?? undefined}
              className="relative z-10 block rounded transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Poster src={t.imageUrl} round={t.isPerson} className="w-9" />
            </QuickViewLink>
          ) : (
            <Poster src={t.imageUrl} round={t.isPerson} className="w-9" />
          )}
        </li>
      ))}
      {rest > 0 && (
        <li className="flex aspect-2/3 w-9 items-center justify-center rounded bg-secondary text-xs font-medium text-muted-foreground">
          +{rest}
        </li>
      )}
    </ul>
  );
}

/** Right-hand poster for a single title; a list tile for a new list. */
function Accessory({ item }: { item: NotificationItem }) {
  if (item.kind !== 'follow_activity') return null;
  if (item.activityKind === 'watchlist_create') {
    return (
      <span className="flex aspect-2/3 w-10 shrink-0 items-center justify-center rounded border border-border bg-secondary/50 text-muted-foreground">
        <ListVideo className="h-4 w-4" />
      </span>
    );
  }
  if (item.total !== 1 || !item.titles[0]) return null;
  return <Poster src={item.titles[0].imageUrl} round={item.titles[0].isPerson} className="w-10" />;
}

function Stars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex translate-y-0.5 items-center gap-px" aria-label={`${rating} out of 5 stars`}>
      {Array.from({ length: Math.floor(rating) }, (_, i) => (
        <Star key={i} className="h-3.5 w-3.5 fill-primary text-primary" />
      ))}
      {rating % 1 !== 0 && <StarHalf className="h-3.5 w-3.5 fill-primary text-primary" />}
    </span>
  );
}

const Strong = ({ children }: { children: React.ReactNode }) => (
  <span className="font-medium text-foreground">{children}</span>
);

function ActorName({ item }: { item: NotificationItem }) {
  if (!item.actor) return null;
  return (
    <Link
      href={`/user/${item.actor.username}`}
      className="relative z-10 font-semibold text-foreground hover:underline underline-offset-2 focus-visible:outline-none focus-visible:underline"
    >
      {item.actor.displayName}
    </Link>
  );
}

const fallbackName = (t: ActivityTitle | undefined) => t?.name || (t?.isPerson ? 'someone' : 'a title');

/** "Taken" · "Taken and Moana" · "Taken, Moana and 3 more" · "5 titles" (old rows with no titles). */
function TitleNames({ titles, total }: { titles: ActivityTitle[]; total: number }) {
  if (titles.length === 0) return <Strong>{total === 1 ? 'a title' : `${total} titles`}</Strong>;
  if (total === 1) return <Strong>{fallbackName(titles[0])}</Strong>;
  if (total === 2)
    return (
      <>
        <Strong>{fallbackName(titles[0])}</Strong> and <Strong>{fallbackName(titles[1])}</Strong>
      </>
    );
  return (
    <>
      <Strong>{fallbackName(titles[0])}</Strong>, <Strong>{fallbackName(titles[1])}</Strong> and {total - 2} more
    </>
  );
}

function ActivityMessage({ item }: { item: FollowActivityNotification }) {
  const names = <TitleNames titles={item.titles} total={item.total} />;
  const list = item.watchlist ? <Strong>{item.watchlist.name}</Strong> : <>a list</>;
  switch (item.activityKind) {
    case 'favorite':
      return <>favorited {names}.</>;
    case 'watchlist_add':
      return <>added {names} to {list}.</>;
    case 'watchlist_create':
      return <>started a new list, {list}.</>;
    case 'review': {
      const rating = item.total === 1 ? item.titles[0]?.rating : null;
      return rating ? (
        <>
          rated {names} <Stars rating={rating} />
        </>
      ) : (
        <>reviewed {names}.</>
      );
    }
  }
}

/** "Netflix", "Netflix and Max", "Netflix, Max and 2 more". */
function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? 'a service';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  const rest = names.length - 2;
  return `${names[0]}, ${names[1]} and ${rest === 1 ? names[2] : `${rest} more`}`;
}

function TitleAlertMessage({ item }: { item: TitleAlertNotification }) {
  const title = <Strong>{item.title ?? 'A title you follow'}</Strong>;
  const where = getCountryName(item.region) || item.region;
  const services = <Strong>{joinNames(item.providers)}</Strong>;
  switch (item.kind) {
    case 'title_available':
      return <>{title} is now streaming on {services}{where ? ` in ${where}` : ''}.</>;
    case 'title_leaving':
      return <>{title} is no longer on {services}{where ? ` in ${where}` : ''}.</>;
    case 'title_new_season':
      return (
        <>
          {item.seasonNumber ? `Season ${item.seasonNumber} of ` : 'A new season of '}
          {title} has started airing.
        </>
      );
  }
}

function Message({ item, onAnswer }: { item: NotificationItem; onAnswer: (answer: 'accepted' | 'declined') => void }) {
  if (item.kind === 'follow_request') return <FollowRequestMessage item={item} onAnswer={onAnswer} />;
  return (
    <p className="text-sm leading-relaxed text-muted-foreground">
      {!item.actor ? (
        <TitleAlertMessage item={item} />
      ) : (
        <>
          <ActorName item={item} />{' '}
          {item.kind === 'follow_accepted' && 'accepted your follow request.'}
          {item.kind === 'follow_back' && 'started following you.'}
          {item.kind === 'follow_activity' && <ActivityMessage item={item} />}
        </>
      )}
    </p>
  );
}

/** Accept / Decline right in the row while the request is still open. */
function FollowRequestMessage({
  item,
  onAnswer,
}: {
  item: Extract<NotificationItem, { kind: 'follow_request' }>;
  onAnswer: (answer: 'accepted' | 'declined') => void;
}) {
  const toast = useToast();
  const [state, setState] = useState<'pending' | 'accepted' | 'declined' | 'gone'>(item.requestState);
  const [busy, setBusy] = useState(false);

  const answer = async (accept: boolean) => {
    setBusy(true);
    try {
      if (accept) await acceptFollowRequestAction(item.actor.id);
      else await rejectFollowRequestAction(item.actor.id);
      setState(accept ? 'accepted' : 'declined');
      onAnswer(accept ? 'accepted' : 'declined');
    } catch {
      toast.error(accept ? 'Could not accept' : 'Could not decline', 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <p className="text-sm leading-relaxed text-muted-foreground">
        <ActorName item={item} />{' '}
        {state === 'pending' && 'wants to follow you.'}
        {state === 'accepted' && 'follows you now.'}
        {state === 'declined' && 'asked to follow you. You declined.'}
        {state === 'gone' && 'asked to follow you.'}
      </p>
      {state === 'pending' && (
        <div className="relative z-10 mt-2 flex gap-2">
          <Button size="sm" className="h-8" disabled={busy} onClick={() => void answer(true)}>
            Accept
          </Button>
          <Button size="sm" variant="outline" className="h-8" disabled={busy} onClick={() => void answer(false)}>
            Decline
          </Button>
        </div>
      )}
    </>
  );
}

/** The row's sentence as plain text, for the stretched link's label. */
function plainText(item: NotificationItem): string {
  if (!item.actor) {
    const t = item.title ?? 'A title you follow';
    if (item.kind === 'title_new_season') return `New season of ${t}`;
    return item.kind === 'title_available' ? `${t} is now streaming` : `${t} is leaving`;
  }
  const who = item.actor.displayName;
  switch (item.kind) {
    case 'follow_request':
      return `${who} wants to follow you`;
    case 'follow_accepted':
      return `${who} accepted your follow request`;
    case 'follow_back':
      return `${who} started following you`;
    case 'follow_activity': {
      const first = fallbackName(item.titles[0]);
      const names = item.total > 1 ? `${first} and ${item.total - 1} more` : first;
      const list = item.watchlist?.name ?? 'a list';
      if (item.activityKind === 'favorite') return `${who} favorited ${names}`;
      if (item.activityKind === 'review') return `${who} reviewed ${names}`;
      if (item.activityKind === 'watchlist_create') return `${who} started a new list, ${list}`;
      return `${who} added ${names} to ${list}`;
    }
  }
}
