import Link from 'next/link';
import { UserAvatar } from '@/components/ui/user-avatar';
import { FollowButton } from './FollowButton';
import type { PublicUserCard } from '@/services/social';
import type { FollowStatus } from '@/services/social';

interface UserListCardProps {
  user: PublicUserCard;
  /** Current viewer's follow state toward this user. */
  followStatus: FollowStatus | null;
  isSelf: boolean;
  blocked?: boolean;
}

/**
 * Row used in /user/[username]/followers and /following pages.
 * Avatar + name on the left, compact Follow button on the right.
 */
export function UserListCard({
  user,
  followStatus,
  isSelf,
  blocked,
}: UserListCardProps) {
  const heading = user.displayName || user.username;
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-border hover:border-foreground/30 transition-colors">
      <Link
        href={`/user/${user.username}`}
        className="flex items-center gap-3 flex-1 min-w-0"
      >
        <UserAvatar
          avatarUrl={user.avatarUrl}
          firstName={user.firstName}
          lastName={user.lastName}
          size="md"
        />
        <div className="flex flex-col min-w-0">
          <span className="text-sm font-semibold text-foreground truncate">
            {heading}
          </span>
          <span className="text-xs text-muted-foreground truncate">
            @{user.username}
          </span>
        </div>
      </Link>
      <FollowButton
        targetUserId={user.id}
        initialStatus={followStatus}
        isSelf={isSelf}
        blocked={blocked}
        size="sm"
      />
    </div>
  );
}
