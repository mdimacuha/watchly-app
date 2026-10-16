import { getMyProfileAction, getProfileShowcaseAction } from '@/actions/profile';
import { MemberProfile } from '@/components/profile/MemberProfile';
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
  // session would crash the showcase fetch below.
  await requireUser();

  // /me renders the same profile visitors see, plus owner controls.
  // ?as=visitor is "Preview as visitor": a real guest render of the page.
  const { as } = await searchParams;
  const preview = as === 'visitor';
  const me = await getMyProfileAction();
  const showcase = await getProfileShowcaseAction(me.username, { asGuest: preview });

  return (
    <AccentScope
      accentColor={showcase.overview.profile.accentColor}
      className="px-4 sm:px-8 py-10 max-w-5xl mx-auto w-full"
    >
      <MemberProfile showcase={showcase} preview={preview} />
    </AccentScope>
  );
}
