import { Bell } from 'lucide-react';
import { getNotificationPreferencesAction } from '@/actions/notifPreferences';
import { BackLink } from '@/components/nav/BackLink';
import { NotificationPrefsForm } from '@/components/notifications/NotificationPrefsForm';

export default async function NotificationsSettingsPage() {
  const prefs = await getNotificationPreferencesAction();

  return (
    <div className="px-8 py-10 max-w-2xl">
      <BackLink fallbackHref="/settings" label="Back to Settings" className="mb-6" />

      <div className="flex items-center gap-3 mb-2">
        <Bell size={24} className="text-primary" />
        <h1 className="text-h2">Notifications</h1>
      </div>
      <p className="text-muted-foreground text-body-regular mb-8">
        Choose what shows up in your bell. Changes apply instantly to new
        notifications.
      </p>

      <NotificationPrefsForm initial={prefs} />
    </div>
  );
}
