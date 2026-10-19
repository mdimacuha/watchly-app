import { requireUser } from '@/server/auth/requireUser';
import { getSessionCookie } from '@/utils/server/cookies';
import { getSettingsSnapshot } from '@/services/settings/snapshot';
import { SettingsPage } from '@/components/settings/v2/SettingsPage';

/** /settings: every setting on one page (see SettingsPage). */
export default async function Page() {
  const userId = await requireUser();
  const snapshot = await getSettingsSnapshot(userId, await getSessionCookie());
  return <SettingsPage snapshot={snapshot} />;
}
