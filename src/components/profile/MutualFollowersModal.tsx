'use client';

import Link from 'next/link';
import { Modal } from '@/components/ui/Modal';
import { UserAvatar } from '@/components/ui/user-avatar';
import { useCachedLoad } from '@/client/cachedLoad';
import { getMutualFollowersAction } from '@/actions/social';
import type { PublicUserCard } from '@/services/social';

// "Followed by" popup on someone else's profile: everyone you follow who also
// follows them. The profile already carries the first few; the full list is
// fetched only when there are more than that.

export function MutualFollowersModal({
  isOpen,
  onClose,
  targetId,
  initial,
  totalCount,
}: {
  isOpen: boolean;
  onClose: () => void;
  targetId: string;
  initial: PublicUserCard[];
  totalCount: number;
}) {
  const needsFetch = totalCount > initial.length;
  const { data, failed, retry } = useCachedLoad(
    `mutual-followers:${targetId}`,
    () => getMutualFollowersAction(targetId),
    isOpen && needsFetch,
  );
  const people = needsFetch ? data : initial;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Followed by" className="max-w-sm">
      <p className="mb-3 text-sm text-muted-foreground">
        {totalCount} {totalCount === 1 ? 'person' : 'people'} you follow {totalCount === 1 ? 'follows' : 'follow'} this account.
      </p>
      {failed && !people ? (
        <p className="text-sm text-muted-foreground">
          Couldn&apos;t load them.{' '}
          <button type="button" onClick={retry} className="text-primary hover:underline cursor-pointer">
            Try again
          </button>
        </p>
      ) : !people ? (
        <ul aria-busy="true" aria-label="Loading" className="flex flex-col gap-1">
          {Array.from({ length: Math.min(totalCount, 6) }).map((_, i) => (
            <li key={i} className="flex items-center gap-3 px-2 py-2">
              <span className="h-10 w-10 rounded-full bg-secondary animate-pulse" />
              <span className="h-3 w-32 rounded bg-secondary animate-pulse" />
            </li>
          ))}
        </ul>
      ) : (
        <ul className="-mx-2 flex max-h-96 flex-col overflow-y-auto">
          {people.map((p) => (
            <li key={p.id}>
              <Link
                href={`/user/${p.username}`}
                onClick={onClose}
                className="group flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-foreground/5 focus-visible:bg-foreground/5 focus-visible:outline-none"
              >
                <UserAvatar avatarUrl={p.avatarUrl} firstName={p.firstName} lastName={p.lastName} size="lg" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium group-hover:text-primary">
                    {p.displayName || p.username}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">@{p.username}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
