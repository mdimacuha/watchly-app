import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AccentScope } from '@/components/profile/AccentScope';
import { getLockedProfileAction, getProfileShowcaseAction } from '@/actions/profile';
import { MemberProfile } from '@/components/profile/MemberProfile';
import { LockedProfile } from '@/components/profile/LockedProfile';
import { getSession } from '@/server/auth/session';
import { ForbiddenAppError } from '@/utils/errors';

interface PageProps {
  params: Promise<{ username: string }>;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  // Deliberately fetch-free: profiles are noindex (privacy + thin-content
  // safety), so we only need a clean share preview, not indexable copy. The
  // heavy showcase fetch stays on the page render.
  return {
    title: `@${username}`,
    description: `See @${username}'s public watchlists, favorites, and taste in movies & TV on Watchly.`,
    alternates: { canonical: `/user/${username}` },
    // Shareable (OG unfurls regardless of robots) but kept out of the index.
    robots: { index: false, follow: true },
    openGraph: {
      type: 'profile',
      title: `@${username} on Watchly`,
      description: `Public watchlists, favorites, and taste from @${username}.`,
      url: `/user/${username}`,
    },
    twitter: {
      card: 'summary_large_image',
      title: `@${username} on Watchly`,
      description: `Public watchlists, favorites, and taste from @${username}.`,
    },
  };
}

export default async function UserProfilePage({ params }: PageProps) {
  const { username } = await params;

  // The visitor view (incl. taste match when signed in). Visibility, blocks
  // and privacy are enforced inside the showcase. A profile this viewer may
  // not open (private / followers-only) gets the locked view; anything else
  // (missing, blocked) is a 404.
  let showcase;
  try {
    showcase = await getProfileShowcaseAction(username);
  } catch (err) {
    if (!(err instanceof ForbiddenAppError)) notFound();
    let locked;
    try {
      locked = await getLockedProfileAction(username);
    } catch {
      notFound();
    }
    const session = await getSession();
    return (
      <AccentScope accentColor={locked.accentColor} className="px-4 sm:px-8 py-10 max-w-5xl mx-auto w-full">
        <LockedProfile profile={locked} viewerSignedIn={!!session} />
      </AccentScope>
    );
  }
  return (
    <AccentScope
      accentColor={showcase.overview.profile.accentColor}
      className="px-4 sm:px-8 py-10 max-w-5xl mx-auto w-full"
    >
      <MemberProfile showcase={showcase} preview={false} />
    </AccentScope>
  );
}
