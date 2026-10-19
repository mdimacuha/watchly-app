'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, Hourglass, Lock, Users } from 'lucide-react';
import { UserAvatar } from '@/components/ui/user-avatar';
import { FollowButton } from '@/components/social/FollowButton';
import { VerifiedBadge } from '@/components/profile/VerifiedBadge';
import { isVerifiedAccount } from '@/constants/verifiedAccounts';
import type { FollowStatus } from '@/services/social';
import type { LockedProfile as LockedProfileData } from '@/services/profile';

/**
 * A profile the viewer can't open: who it is, follower counts, and why it's
 * closed. Followers-only profiles offer a follow request (they open once
 * accepted); private profiles open to no one but the owner, though people
 * can still send a follow request.
 */
export function LockedProfile({
  profile,
  viewerSignedIn,
  preview = false,
}: {
  profile: LockedProfileData;
  viewerSignedIn: boolean;
  preview?: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<FollowStatus | null>(profile.followState.status);
  const handle = `@${profile.username}`;
  const followersOnly = profile.visibility === 'followers_only';

  const onStatusChange = (next: FollowStatus | null) => {
    setStatus(next);
    // Accepted straight away on a followers-only profile (or it went public
    // meanwhile): load the real profile.
    if (next === 'accepted' && followersOnly) router.refresh();
  };

  const requested = status === 'pending';
  const Icon = requested ? Hourglass : followersOnly ? Users : Lock;
  const heading = !followersOnly
    ? 'This profile is private'
    : requested
      ? 'Request sent'
      : `Only followers can see ${handle}`;
  // Private: following is allowed (a request), but never opens the profile.
  const body = !followersOnly
    ? status === 'accepted'
      ? `You follow ${handle}, but they keep their profile private, even from followers.`
      : requested
        ? `Request sent. ${handle} keeps their profile private, even from followers.`
        : `${handle} keeps their watchlists, favorites and reviews to themselves. You can still send a follow request.`
    : requested
      ? `You'll see ${handle}'s lists, favorites and reviews once they accept.`
      : `Follow to send a request. Once ${handle} accepts, you'll see their lists, favorites and reviews.`;

  return (
    <div className="flex flex-col gap-8">
      {preview && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-primary/40 bg-primary/10 px-4 py-2 text-sm">
          <span className="inline-flex items-center gap-2">
            <Eye className="h-4 w-4" /> Previewing your profile as a signed-out visitor sees it.
          </span>
          <Link href="/me" className="font-medium text-primary hover:underline">
            Exit preview
          </Link>
        </div>
      )}

      <header className="flex items-center gap-4">
        <UserAvatar avatarUrl={profile.avatarUrl} firstName={profile.firstName} lastName={profile.lastName} size="lg" />
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-h2">
            <span className="truncate">{profile.displayName}</span>
            {isVerifiedAccount(profile.username) && <VerifiedBadge size="lg" />}
          </h1>
          <p className="text-sm text-muted-foreground">
            {handle} · <span className="tabular-nums text-foreground">{profile.followSummary.followersCount}</span>{' '}
            {profile.followSummary.followersCount === 1 ? 'follower' : 'followers'} ·{' '}
            <span className="tabular-nums text-foreground">{profile.followSummary.followingCount}</span> following
          </p>
        </div>
      </header>

      <section className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card px-6 py-12 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
          <Icon className="h-5 w-5 text-muted-foreground" />
        </span>
        <h2 className="text-h3">{heading}</h2>
        <p className="max-w-md text-sm text-muted-foreground">{body}</p>
        {!profile.isSelf && (
          <div className="mt-2">
            {viewerSignedIn ? (
              <FollowButton
                targetUserId={profile.userId}
                initialStatus={status}
                isSelf={false}
                blocked={profile.followState.blocked}
                requiresApproval
                onStatusChange={onStatusChange}
              />
            ) : (
              <Link
                href={`/signin?redirect=${encodeURIComponent(`/user/${profile.username}`)}`}
                className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Sign in to follow
              </Link>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
