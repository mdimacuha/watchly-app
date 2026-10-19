import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { users } from '@/db/schema';
import { listShelves } from '@/services/favorites/shelves';
import { listTitleAlerts } from '@/services/alerts';
import { getNotificationPreferences } from '@/services/notifications/preferences';
import { getSelectedProviders } from '@/services/preferences/forYouPrefs';
import { getProvidersCatalog } from '@/server/tmdb/providersCatalog';
import { listBlockedUsers } from '@/services/social';
import { getVisitorPreview } from '@/services/profile/visitorPreview';
import { getPrivacySettings } from './index';
import { listSessions } from './sessions';

// Everything the Settings page shows, in one parallel read. Every layout
// variant (A/B/C) renders from this and saves through the same actions.

export async function getSettingsSnapshot(userId: string, currentSessionToken: string | null) {
  const [account, privacy, preview, shelves, notifications, alerts, selectedProviders, catalog, blocked, sessions] =
    await Promise.all([
      db
        .select({ email: users.email, username: users.username, createdAt: users.createdAt })
        .from(users)
        .where(eq(users.id, userId))
        .then((r) => r[0]),
      getPrivacySettings(userId),
      getVisitorPreview(userId),
      listShelves(userId).then((s) =>
        s.shelves.map((shelf) => ({
          id: shelf.id,
          name: shelf.name,
          isPublic: shelf.isPublic,
          count: s.items.filter((i) => i.shelfId === shelf.id).length,
        })),
      ),
      getNotificationPreferences(userId),
      listTitleAlerts(userId),
      getSelectedProviders(userId),
      getProvidersCatalog().then((c) => c.providers),
      listBlockedUsers(userId),
      listSessions(userId, currentSessionToken),
    ]);

  return {
    account: { email: account.email, username: account.username, memberSince: account.createdAt.toISOString() },
    privacy,
    preview,
    shelves,
    notifications,
    alerts,
    forYou: { selectedProviders, catalog },
    blocked,
    sessions,
  };
}

export type SettingsSnapshot = Awaited<ReturnType<typeof getSettingsSnapshot>>;
