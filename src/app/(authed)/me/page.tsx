import { User } from 'lucide-react';
import {
  getMyProfileAction,
  getMyProfileOverviewAction,
  getProfileShowcaseAction,
} from '@/actions/profile';
import { MyProfileClient } from '@/components/profile/MyProfileClient';
import { ProfilePrototype } from '@/components/profile/ProfilePrototype';
import { AccentScope } from '@/components/profile/AccentScope';
import { requireUser } from '@/server/auth/requireUser';

export default async function MyProfilePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Validates the session against the DB and redirects to /signin if it's
  // gone stale (cookie present but session row missing or expired).
  // Middleware only checks cookie presence — without this guard a stale
  // session causes getMyProfileOverviewAction to throw Unauthorized and
  // crash the page render.
  await requireUser();

  // PROTOTYPE: profile redesign (?variant=a|b|c, ?as=visitor), dev builds
  // only. /me renders the same profile visitors see, plus owner controls.
  if (process.env.NODE_ENV !== 'production') {
    const { as } = await searchParams;
    const me = await getMyProfileAction();
    const preview = as === 'visitor';
    const showcase = await getProfileShowcaseAction(me.username, { asGuest: preview });
    return (
      <AccentScope
        accentColor={showcase.overview.profile.accentColor}
        className="px-4 sm:px-8 py-10 max-w-5xl mx-auto w-full"
      >
        <ProfilePrototype showcase={showcase} preview={preview} />
      </AccentScope>
    );
  }

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
