'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Search, Users } from 'lucide-react';
import { UserAvatar } from '@/components/ui/user-avatar';
import { AccentScope } from '@/components/profile/AccentScope';
import { cn } from '@/lib/cn';
import { normalizeAccentColor } from '@/constants/accentColors';
import { isVerifiedAccount } from '@/constants/verifiedAccounts';
import { VerifiedBadge } from '@/components/profile/VerifiedBadge';
import type { FollowStatus, PublicUserCard } from '@/services/social';
import { FollowButton } from './FollowButton';

export interface FollowListPerson {
  user: PublicUserCard;
  followStatus: FollowStatus | null;
  blocked: boolean;
  isSelf: boolean;
  accentColor: string | null;
  bio: string;
  followsViewer: boolean;
}

const SEARCH_THRESHOLD = 6;

/** Searchable grid of person cards (each wears its owner's accent). */
export function FollowListClient({
  people,
  emptyTitle,
  emptyHint,
}: {
  people: FollowListPerson[];
  emptyTitle: string;
  emptyHint?: string;
}) {
  const [query, setQuery] = useState('');
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return people;
    return people.filter(
      (p) =>
        p.user.username.toLowerCase().includes(q) ||
        p.user.displayName.toLowerCase().includes(q) ||
        `${p.user.firstName} ${p.user.lastName}`.toLowerCase().includes(q),
    );
  }, [people, query]);

  if (people.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border px-6 py-14 text-center">
        <Users className="h-8 w-8 text-muted-foreground" />
        <p className="font-medium">{emptyTitle}</p>
        {emptyHint && <p className="text-sm text-muted-foreground">{emptyHint}</p>}
        <Link href="/discover" className="mt-2 text-sm text-primary hover:underline">
          Find people
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {people.length >= SEARCH_THRESHOLD && (
        <label className="relative w-full sm:max-w-xs">
          <span className="sr-only">Search people</span>
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or @handle"
            className="h-10 w-full rounded-md border border-input bg-card pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </label>
      )}

      <p className="sr-only" aria-live="polite">
        {shown.length} {shown.length === 1 ? 'person' : 'people'}
      </p>

      {shown.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No one matches “{query.trim()}”.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {shown.map((p) => (
            <li key={p.user.id}>
              <PersonCard person={p} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PersonCard({ person }: { person: FollowListPerson }) {
  const { user } = person;
  const name = user.displayName || user.username;
  const viewerFollows = person.followStatus === 'accepted';
  const badge = person.isSelf
    ? 'You'
    : person.followsViewer && viewerFollows
      ? 'Mutual'
      : person.followsViewer
        ? 'Follows you'
        : null;

  return (
    // Each card wears its person's accent — the member card's gradient edge.
    <AccentScope accentColor={normalizeAccentColor(person.accentColor)}>
      <div className="h-full rounded-xl bg-linear-to-br from-primary/70 via-primary/20 to-border p-px">
        <div className="relative flex h-full items-center gap-3 overflow-hidden rounded-xl bg-card p-3">
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-linear-to-br from-primary/10 via-transparent to-transparent" />
          <Link href={`/user/${user.username}`} className="relative flex min-w-0 flex-1 items-center gap-3 group">
            <UserAvatar
              avatarUrl={user.avatarUrl}
              firstName={user.firstName}
              lastName={user.lastName}
              size="lg"
              className="ring-2 ring-primary/40"
            />
            <div className="min-w-0">
              <p className="flex items-center gap-2">
                <span className="truncate text-sm font-semibold group-hover:text-primary transition-colors">{name}</span>
                {isVerifiedAccount(user.username) && <VerifiedBadge size="sm" className="shrink-0" />}
                {badge && (
                  <span
                    className={cn(
                      'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                      badge === 'Mutual' ? 'bg-primary/20 text-primary' : 'bg-secondary text-muted-foreground',
                    )}
                  >
                    {badge}
                  </span>
                )}
              </p>
              <p className="truncate text-xs text-muted-foreground">@{user.username}</p>
              {person.bio && <p className="mt-0.5 truncate text-xs text-foreground/80">{person.bio}</p>}
            </div>
          </Link>
          <div className="relative shrink-0">
            <FollowButton
              targetUserId={user.id}
              initialStatus={person.followStatus}
              isSelf={person.isSelf}
              blocked={person.blocked}
              size="sm"
            />
          </div>
        </div>
      </div>
    </AccentScope>
  );
}
