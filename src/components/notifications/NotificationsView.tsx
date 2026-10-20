'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { Bell, Settings2, Users } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useToast } from '@/hooks/useToast';
import { EmptyState } from '@/components/watchly/EmptyState';
import { NotificationRow } from '@/components/notifications/NotificationRow';
import { getNotificationsAction, markAllNotificationsReadAction } from '@/actions/notifications';
import { NOTIFICATIONS_READ_EVENT, trackNotifications } from '@/client/notifications';
import type { NotificationItem, NotificationScope, NotificationsPayload } from '@/services/notifications/getNotifications';

const TABS: { id: NotificationScope; label: string }[] = [
  { id: 'you', label: 'For you' },
  { id: 'following', label: 'Following' },
];

type Section = 'New' | 'Today' | 'Yesterday' | 'This week' | 'Earlier';
const SECTION_ORDER: Section[] = ['New', 'Today', 'Yesterday', 'This week', 'Earlier'];

/** Day buckets in the viewer's own timezone. */
function dayBucket(iso: string, now: Date): Exclude<Section, 'New'> {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const t = new Date(iso).getTime();
  const day = 86_400_000;
  if (t >= today.getTime()) return 'Today';
  if (t >= today.getTime() - day) return 'Yesterday';
  if (t >= today.getTime() - 6 * day) return 'This week';
  return 'Earlier';
}

const subscribeNoop = () => () => {};

export function NotificationsView({
  scope,
  initial,
  unread,
  followingOn,
  viewerId,
}: {
  scope: NotificationScope;
  initial: NotificationsPayload;
  /** Unread per tab when the page loaded. */
  unread: Record<NotificationScope, number>;
  /** Whether activity from people you follow is switched on in Settings. */
  followingOn: boolean;
  viewerId: string;
}) {
  const toast = useToast();
  const [items, setItems] = useState<NotificationItem[]>(initial.items);
  const [nextBefore, setNextBefore] = useState(initial.nextBefore);
  const [loadingMore, setLoadingMore] = useState(false);
  // What was unread when the page opened stays under "New" for this visit,
  // even though it's marked read straight away.
  const [newIds] = useState(() => new Set(initial.items.filter((i) => !i.isRead).map((i) => i.id)));
  // Day buckets need the viewer's clock: the server renders one flat list.
  const isClient = useSyncExternalStore(subscribeNoop, () => true, () => false);

  const marked = useRef(false);
  useEffect(() => {
    if (marked.current) return;
    marked.current = true;
    trackNotifications(viewerId, 'notifications_viewed', { tab: scope, unread: unread[scope] });
    if (unread[scope] === 0) return;
    markAllNotificationsReadAction(scope).then(
      () => window.dispatchEvent(new Event(NOTIFICATIONS_READ_EVENT)),
      () => {},
    );
  }, [scope, unread, viewerId]);

  const sections = useMemo(() => {
    const now = new Date();
    const map = new Map<Section, NotificationItem[]>();
    for (const item of items) {
      const s: Section = newIds.has(item.id) ? 'New' : isClient ? dayBucket(item.createdAt, now) : 'Earlier';
      map.set(s, [...(map.get(s) ?? []), item]);
    }
    return SECTION_ORDER.filter((s) => map.has(s)).map((s) => ({ label: s, items: map.get(s)! }));
  }, [items, newIds, isClient]);

  const loadOlder = async () => {
    if (!nextBefore || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await getNotificationsAction({ before: nextBefore, scope });
      setItems((cur) => {
        const seen = new Set(cur.map((i) => i.id));
        return [...cur, ...page.items.filter((i) => !seen.has(i.id))];
      });
      setNextBefore(page.nextBefore);
    } catch {
      toast.error('Could not load older notifications', 'Please try again.');
    } finally {
      setLoadingMore(false);
    }
  };

  const onOpen = (item: NotificationItem) =>
    trackNotifications(viewerId, 'notification_opened', {
      tab: scope,
      kind: item.kind,
      ...(item.kind === 'follow_activity' ? { activityKind: item.activityKind, total: item.total } : {}),
      wasNew: newIds.has(item.id),
    });
  const onAnswer = (answer: 'accepted' | 'declined') =>
    trackNotifications(viewerId, 'follow_request_answered', { answer, surface: 'notifications' });

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8 sm:px-8 sm:py-10">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Bell size={24} className="text-primary" />
          <h1 className="text-h2">Notifications</h1>
        </div>
        <Link
          href="/settings#settings-notifications"
          aria-label="Notification settings"
          title="Notification settings"
          className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Settings2 className="h-5 w-5" />
        </Link>
      </header>

      <nav aria-label="Notification types" className="flex gap-1 border-b border-border">
        {TABS.map((t) => {
          const active = t.id === scope;
          const count = active ? 0 : unread[t.id];
          return (
            <Link
              key={t.id}
              href={t.id === 'you' ? '/notifications' : '/notifications?tab=following'}
              aria-current={active ? 'page' : undefined}
              replace
              className={cn(
                '-mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
                active ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {t.label}
              {count > 0 && (
                <span className="min-w-5 rounded-full bg-primary/15 px-1.5 py-0.5 text-center text-xs font-semibold leading-none text-primary">
                  {count > 99 ? '99+' : count}
                  <span className="sr-only"> unread</span>
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {items.length === 0 ? (
        <Empty scope={scope} followingOn={followingOn} />
      ) : (
        <div className="flex flex-col gap-6">
          {sections.map((s) => (
            <section key={s.label} aria-label={s.label}>
              {/* Headings only once the viewer's clock is known (or for New). */}
              {(isClient || s.label === 'New') && (
                <h2 className="mb-1 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {s.label}
                </h2>
              )}
              <ul className="-mx-3 flex flex-col">
                {s.items.map((item) => (
                  <NotificationRow key={item.id} item={item} onOpen={onOpen} onAnswer={onAnswer} />
                ))}
              </ul>
            </section>
          ))}

          {nextBefore ? (
            <button
              type="button"
              onClick={() => void loadOlder()}
              disabled={loadingMore}
              className="mx-auto rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary/60 disabled:opacity-60 cursor-pointer"
            >
              {loadingMore ? 'Loading…' : 'Load older'}
            </button>
          ) : (
            <p className="text-center text-xs text-muted-foreground">You&apos;re all caught up.</p>
          )}
        </div>
      )}
    </div>
  );
}

function Empty({ scope, followingOn }: { scope: NotificationScope; followingOn: boolean }) {
  if (scope === 'you') {
    return (
      <EmptyState
        icon={Bell}
        title="Nothing for you yet"
        description="New followers, follow requests and your title alerts show up here."
      />
    );
  }
  if (!followingOn) {
    return (
      <EmptyState
        icon={Users}
        title="Following activity is off"
        description="Turn it on to see what people you follow favorite, review and add to their public lists."
        action={
          <Link
            href="/settings#settings-notifications"
            className="text-sm font-medium text-primary underline-offset-2 hover:underline"
          >
            Notification settings
          </Link>
        }
      />
    );
  }
  return (
    <EmptyState
      icon={Users}
      title="Quiet for now"
      description="When people you follow favorite, review or add to their public lists, it shows up here."
    />
  );
}
