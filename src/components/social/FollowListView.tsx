import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BackLink } from '@/components/nav/BackLink';
import { UserAvatar } from '@/components/ui/user-avatar';
import { AccentScope } from '@/components/profile/AccentScope';
import { getPublicProfileByUsername } from '@/services/profile';
import {
  getFollowListExtras,
  getFollowStatesBulk,
  getFollowSummary,
  listFollowers,
  listFollowing,
} from '@/services/social';
import { getSession } from '@/server/auth/session';
import { cn } from '@/lib/cn';
import { isVerifiedAccount } from '@/constants/verifiedAccounts';
import { VerifiedBadge } from '@/components/profile/VerifiedBadge';
import { FollowListClient, type FollowListPerson } from './FollowListClient';

export type FollowListKind = 'followers' | 'following';

/**
 * Shared /user/[username]/followers and /following page: the profile owner
 * on top, a Followers · Following switch, then searchable person cards that
 * wear each person's own accent. Visibility is enforced by
 * getPublicProfileByUsername (private / followers-only / blocked).
 */
export async function FollowListView({ username, kind }: { username: string; kind: FollowListKind }) {
  const session = await getSession();
  const viewerId = session?.userId ?? null;

  let profile;
  try {
    profile = await getPublicProfileByUsername(username, viewerId);
  } catch {
    notFound();
  }

  const [users, summary] = await Promise.all([
    kind === 'followers' ? listFollowers(profile.userId) : listFollowing(profile.userId),
    getFollowSummary(profile.userId),
  ]);
  const ids = users.map((u) => u.id);
  const [states, extras] = await Promise.all([
    getFollowStatesBulk(viewerId, ids),
    getFollowListExtras(viewerId, ids),
  ]);

  const people: FollowListPerson[] = users.map((u) => {
    const state = states.get(u.id);
    const extra = extras.get(u.id);
    return {
      user: u,
      followStatus: state?.status ?? null,
      blocked: state?.blocked ?? false,
      isSelf: viewerId === u.id,
      accentColor: extra?.accentColor ?? null,
      bio: extra?.bio ?? '',
      followsViewer: extra?.followsViewer ?? false,
    };
  });

  const ownerName = profile.displayName || profile.username;
  const isOwnList = viewerId === profile.userId;

  return (
    <AccentScope
      accentColor={profile.accentColor}
      className="px-4 sm:px-8 py-10 max-w-4xl mx-auto w-full flex flex-col gap-6"
    >
      <BackLink fallbackHref={`/user/${profile.username}`} label={`Back to @${profile.username}`} />

      <header className="flex flex-col gap-4">
        <Link href={`/user/${profile.username}`} className="flex w-fit items-center gap-3 group">
          <UserAvatar avatarUrl={profile.avatarUrl} firstName={profile.firstName} lastName={profile.lastName} size="lg" />
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-h2 leading-tight group-hover:text-primary transition-colors">
              {ownerName}
              {isVerifiedAccount(profile.username) && <VerifiedBadge size="md" />}
            </h1>
            <p className="text-sm text-muted-foreground">@{profile.username}</p>
          </div>
        </Link>

        <nav aria-label="Connections" className="flex w-fit gap-1 rounded-lg bg-secondary p-1">
          {(
            [
              ['followers', 'Followers', summary.followersCount],
              ['following', 'Following', summary.followingCount],
            ] as const
          ).map(([k, label, count]) => (
            <Link
              key={k}
              href={`/user/${profile.username}/${k}`}
              aria-current={kind === k ? 'page' : undefined}
              className={cn(
                'rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
                kind === k ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {label} <span className="ml-1 tabular-nums text-muted-foreground">{count}</span>
            </Link>
          ))}
        </nav>
      </header>

      <FollowListClient
        people={people}
        emptyTitle={
          kind === 'followers'
            ? isOwnList
              ? 'No followers yet'
              : `No one follows @${profile.username} yet`
            : isOwnList
              ? "You're not following anyone yet"
              : `@${profile.username} isn't following anyone yet`
        }
        emptyHint={
          kind === 'following' && isOwnList
            ? 'Find people through search or from who follows you.'
            : isOwnList
              ? 'Share your profile so people can find you.'
              : undefined
        }
      />
    </AccentScope>
  );
}
