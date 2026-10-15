import { User } from 'lucide-react';
import { getMyProfileOverviewAction } from '@/actions/profile';
import { MyProfileClient } from '@/components/profile/MyProfileClient';
import { AccentScope } from '@/components/profile/AccentScope';
import { requireUser } from '@/server/auth/requireUser';

export default async function MyProfilePage() {
  // Validates the session against the DB and redirects to /signin if it's
  // gone stale (cookie present but session row missing or expired).
  // Middleware only checks cookie presence — without this guard a stale
  // session causes getMyProfileOverviewAction to throw Unauthorized and
  // crash the page render.
  await requireUser();
  const overview = await getMyProfileOverviewAction();

  return (
    <AccentScope
      accentColor={overview.profile.accentColor}
      className="px-8 py-10 flex flex-col gap-6 max-w-5xl mx-auto w-full"
    >
      <div className="flex items-center gap-3">
        <User size={24} className="text-primary" />
        <h1 className="text-h2">My Profile</h1>
      </div>
      <MyProfileClient overview={overview} />
    </AccentScope>
  );
}
