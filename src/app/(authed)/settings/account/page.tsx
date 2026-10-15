import { AtSign } from 'lucide-react';
import { getSessionWithUser } from '@/server/auth/session';
import { redirect } from 'next/navigation';
import { BackLink } from '@/components/nav/BackLink';
import { AccountSettingsClient } from '@/components/settings/AccountSettingsClient';

export default async function AccountSettingsPage() {
  const session = await getSessionWithUser();
  if (!session) redirect('/signin');

  return (
    <div className="px-8 py-10 max-w-2xl">
      <BackLink fallbackHref="/settings" label="Back to Settings" className="mb-6" />

      <div className="flex items-center gap-3 mb-6">
        <AtSign size={24} className="text-primary" />
        <h1 className="text-h2">Account</h1>
      </div>
      <p className="text-muted-foreground text-body-regular mb-8">
        Change your email or password.
      </p>

      <AccountSettingsClient currentEmail={session.user.email} />
    </div>
  );
}
