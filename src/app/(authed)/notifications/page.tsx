import { NotificationsView } from '@/components/notifications/NotificationsView';
import { requireUser } from '@/server/auth/requireUser';
import { getNotificationPreferences, getNotifications, getUnreadCounts } from '@/services/notifications';

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  // Validates session against DB; redirects to /signin on stale cookie.
  const userId = await requireUser();
  const scope = (await searchParams).tab === 'following' ? 'following' : 'you';
  const [initial, unread, prefs] = await Promise.all([
    getNotifications(userId, { scope }),
    getUnreadCounts(userId),
    getNotificationPreferences(userId),
  ]);

  return (
    // Keyed so switching tabs starts fresh (new list, new "New" section).
    <NotificationsView
      key={scope}
      scope={scope}
      initial={initial}
      unread={unread}
      followingOn={prefs.follow_activity}
      viewerId={userId}
    />
  );
}
