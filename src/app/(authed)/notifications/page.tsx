import { Bell } from 'lucide-react';
import { getNotificationsAction } from '@/actions/notifications';
import { NotificationRow } from '@/components/notifications/NotificationRow';
import { EmptyState } from '@/components/watchly/EmptyState';
import { MarkAllNotificationsReadButton } from '@/components/notifications/MarkAllNotificationsReadButton';
import { requireUser } from '@/server/auth/requireUser';

export default async function NotificationsPage() {
  // Validates session against DB; redirects to /signin on stale cookie.
  await requireUser();
  const { items, hasMore } = await getNotificationsAction();

  return (
    <div className="px-8 py-10 max-w-3xl mx-auto w-full flex flex-col gap-6">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Bell size={24} className="text-primary" />
          <h1 className="text-h2">Notifications</h1>
        </div>
        {items.some((i) => !i.isRead) && <MarkAllNotificationsReadButton />}
      </header>

      {items.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="No notifications yet"
          description="When someone follows you or one of the people you follow adds a title, it'll show up here."
        />
      ) : (
        <div className="flex flex-col divide-y divide-border/40">
          {items.map((item) => (
            <NotificationRow key={item.id} item={item} />
          ))}
          {hasMore && (
            <p className="text-xs text-muted-foreground text-center py-6">
              Showing the most recent. Older notifications are pruned over time.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
