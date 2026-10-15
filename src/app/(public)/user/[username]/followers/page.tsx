import { notFound } from 'next/navigation';
import { Users } from 'lucide-react';
import { BackLink } from '@/components/nav/BackLink';
import { EmptyState } from '@/components/watchly/EmptyState';
import { UserListCard } from '@/components/social/UserListCard';
import { getPublicProfileByUsername } from '@/services/profile';
import { listFollowers, getFollowStatesBulk } from '@/services/social';
import { getSession } from '@/server/auth/session';

interface PageProps {
  params: Promise<{ username: string }>;
}

export default async function FollowersPage({ params }: PageProps) {
  const { username } = await params;
  const session = await getSession();
  const viewerId = session?.userId ?? null;

  let profile;
  try {
    profile = await getPublicProfileByUsername(username, viewerId);
  } catch {
    notFound();
  }

  const users = await listFollowers(profile.userId);
  // Batched lookup so each row's Follow button knows the viewer's status
  // toward that user — single SQL round-trip instead of N per page.
  const states = await getFollowStatesBulk(
    viewerId,
    users.map((u) => u.id),
  );

  return (
    <div className="px-8 py-10 max-w-3xl mx-auto w-full flex flex-col gap-6">
      <BackLink
        fallbackHref={`/user/${profile.username}`}
        label={`Back to @${profile.username}`}
      />

      <header className="flex items-center gap-3">
        <Users size={24} className="text-primary" />
        <h1 className="text-h2">
          Followers of @{profile.username}
        </h1>
      </header>

      {users.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No followers yet"
          description={`@${profile.username} hasn't been followed by anyone yet.`}
        />
      ) : (
        <div className="flex flex-col gap-2">
          {users.map((u) => {
            const state = states.get(u.id);
            return (
              <UserListCard
                key={u.id}
                user={u}
                followStatus={state?.status ?? null}
                isSelf={viewerId === u.id}
                blocked={state?.blocked}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
