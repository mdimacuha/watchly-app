import { Lock } from 'lucide-react';
import { getPrivacyAction } from '@/actions/settings';
import { BackLink } from '@/components/nav/BackLink';
import { PrivacySettingsClient } from '@/components/settings/PrivacySettingsClient';

export default async function PrivacySettingsPage() {
  const initial = await getPrivacyAction();

  return (
    <div className="px-8 py-10 max-w-2xl">
      <BackLink fallbackHref="/settings" label="Back to Settings" className="mb-6" />

      <div className="flex items-center gap-3 mb-6">
        <Lock size={24} className="text-primary" />
        <h1 className="text-h2">Privacy</h1>
      </div>
      <p className="text-muted-foreground text-body-regular mb-8">
        Control who can see your profile, watchlists, and favorites.
      </p>

      <PrivacySettingsClient initial={initial} />
    </div>
  );
}
