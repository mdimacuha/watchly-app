'use client';

import { useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import { EmptyState } from '@/components/watchly/EmptyState';
import { UserListCard } from '@/components/social/UserListCard';
import type { FollowListEntry } from '@/actions/social';

interface FollowListTabPanelProps {
  /** Async loader — kept generic so the same panel works for "my" lists
   *  (no userId arg) and "their" lists. The parent picks which action. */
  loader: () => Promise<FollowListEntry[]>;
  emptyTitle: string;
  emptyDescription: string;
}

/**
 * Lazy-loaded panel for the Followers / Following tabs on the profile
 * page. Fetches once on mount and caches in component state — switching
 * tabs is cheap because the parent only mounts the active panel.
 */
export function FollowListTabPanel({
  loader,
  emptyTitle,
  emptyDescription,
}: FollowListTabPanelProps) {
  const [entries, setEntries] = useState<FollowListEntry[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    loader().then((rows) => {
      if (!cancelled) {
        setEntries(rows);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [loader]);

  if (entries === null) {
    return (
      <div className="flex flex-col gap-2">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-16 rounded-lg border border-border animate-pulse bg-card/40"
          />
        ))}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title={emptyTitle}
        description={emptyDescription}
      />
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {entries.map((e) => (
        <UserListCard
          key={e.user.id}
          user={e.user}
          followStatus={e.status}
          isSelf={e.isSelf}
          blocked={e.blocked}
        />
      ))}
    </div>
  );
}
