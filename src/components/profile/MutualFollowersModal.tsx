'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { UserAvatar } from '@/components/ui/user-avatar';
import { VerifiedBadge } from '@/components/profile/VerifiedBadge';
import { isVerifiedAccount } from '@/constants/verifiedAccounts';
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
  username,
  initial,
  totalCount,
}: {
  isOpen: boolean;
  onClose: () => void;
  targetId: string;
  /** The profile being viewed. */
  username: string;
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
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      labelledBy="mutuals-title"
      className="max-w-md border border-border bg-card"
    >
      <header className="border-b border-border px-5 pb-4 pt-5 pr-14">
        <h2 id="mutuals-title" className="text-base font-semibold leading-tight">
          Followed by {totalCount} {totalCount === 1 ? 'person' : 'people'} you know
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          People you follow who also follow <span className="break-all text-foreground">@{username}</span>
        </p>
      </header>

      {failed && !people ? (
        <p className="px-5 py-8 text-center text-sm text-muted-foreground">
          Couldn&apos;t load everyone.{' '}
          <button type="button" onClick={retry} className="font-medium text-primary hover:underline cursor-pointer">
            Try again
          </button>
        </p>
      ) : !people ? (
        <ul aria-busy="true" aria-label="Loading" className="py-2">
          {Array.from({ length: Math.min(totalCount, 6) }).map((_, i) => (
            <li key={i} className="flex min-h-16 items-center gap-3 px-5">
              <span className="h-10 w-10 shrink-0 rounded-full bg-secondary animate-pulse" />
              <span className="flex flex-col gap-2">
                <span className="h-3 w-28 rounded bg-secondary animate-pulse" />
                <span className="h-2.5 w-20 rounded bg-secondary/70 animate-pulse" />
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="max-h-[min(60dvh,26rem)] overflow-y-auto py-2">
          {people.map((p) => {
            const name = p.displayName || p.username;
            return (
              <li key={p.id}>
                <Link
                  href={`/user/${p.username}`}
                  onClick={onClose}
                  className="group flex min-h-16 items-center gap-3 px-5 py-2 transition-colors hover:bg-secondary/60 focus-visible:bg-secondary/60 focus-visible:outline-none"
                >
                  <UserAvatar avatarUrl={p.avatarUrl} firstName={p.firstName} lastName={p.lastName} size="lg" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1">
                      <span className="truncate text-sm font-semibold group-hover:text-primary">{name}</span>
                      {isVerifiedAccount(p.username) && <VerifiedBadge size="sm" />}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">@{p.username}</span>
                  </span>
                  <ChevronRight
                    aria-hidden
                    className="h-4 w-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <footer className="border-t border-border px-5 py-3">
        <Link
          href={`/user/${username}/followers`}
          onClick={onClose}
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          See all of @{username}&apos;s followers →
        </Link>
      </footer>
    </Modal>
  );
}
