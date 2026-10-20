import { redirect } from 'next/navigation';
import { getLockedProfileAction, getProfileShowcaseAction } from '@/actions/profile';
import { getSessionWithUser } from '@/server/auth/session';
import { ForbiddenAppError } from '@/utils/errors';
import { LockedProfile } from '@/components/profile/LockedProfile';
import { MemberProfile } from '@/components/profile/MemberProfile';
import { AccentScope } from '@/components/profile/AccentScope';

export default async function MyProfilePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // One cached query gives the session and the username: the profile
  // loads everything else itself (a separate full-profile read here only
  // delayed it). A stale session redirects to /signin.
  const auth = await getSessionWithUser();
  if (!auth) redirect('/signin');

  // ?as=visitor is "Preview as visitor": a real guest render of the page.
  const { as } = await searchParams;
  const preview = as === 'visitor';
  let showcase;
  try {
    showcase = await getProfileShowcaseAction(auth.user.username, { asGuest: preview });
  } catch (err) {
    // A guest can't open a private / followers-only profile, so the preview
    // of one is the locked view they'd get.
    if (!(preview && err instanceof ForbiddenAppError)) throw err;
    const locked = await getLockedProfileAction(auth.user.username, { asGuest: true });
    return (
      <AccentScope accentColor={locked.accentColor} className="px-4 sm:px-8 py-10 max-w-5xl mx-auto w-full">
        <LockedProfile profile={locked} viewerSignedIn={false} preview />
      </AccentScope>
    );
  }

  return (
    <AccentScope
      accentColor={showcase.overview.profile.accentColor}
      className="px-4 sm:px-8 py-10 max-w-5xl mx-auto w-full"
    >
      <MemberProfile showcase={showcase} preview={preview} />
    </AccentScope>
  );
}
