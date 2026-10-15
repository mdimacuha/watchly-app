'use client';

import { useState, useTransition } from 'react';
import type {
  ActivityResponse,
  ActivityGroupLabel,
  ActivityItem,
} from '@/services/activity/types';
import { ActivitySection } from './ActivitySection';
import { MarkAllReadButton } from './MarkAllReadButton';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/useToast';
import { getActivityAction } from '@/actions/activity';

interface ActivityPageProps {
  data: ActivityResponse & { hasMore: boolean };
}

const GROUP_ORDER: ActivityGroupLabel[] = [
  'TODAY',
  'YESTERDAY',
  'THIS WEEK',
  'OLDER',
];

// Compute the bucket using the viewer's local time (server only emits a
// fallback). This is what makes TODAY / YESTERDAY edges feel right when the
// user's TZ differs from the server's.
function clientGroupFor(createdAtIso: string): ActivityGroupLabel {
  const date = new Date(createdAtIso);
  const now = new Date();

  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);

  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - 7);

  if (date >= todayStart) return 'TODAY';
  if (date >= yesterdayStart) return 'YESTERDAY';
  if (date >= weekStart) return 'THIS WEEK';
  return 'OLDER';
}

function groupItems(items: ActivityItem[]): Map<ActivityGroupLabel, ActivityItem[]> {
  const groups = new Map<ActivityGroupLabel, ActivityItem[]>();
  for (const label of GROUP_ORDER) groups.set(label, []);
  for (const item of items) {
    const bucket = clientGroupFor(item.createdAt);
    const list = groups.get(bucket);
    if (list) list.push(item);
  }
  return groups;
}

export function ActivityPage({ data }: ActivityPageProps) {
  const [items, setItems] = useState<ActivityItem[]>(data.items);
  const [hasMore, setHasMore] = useState(data.hasMore);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  const groups = groupItems(items);

  const loadMore = () => {
    const oldest = items[items.length - 1];
    if (!oldest) return;
    startTransition(async () => {
      try {
        const next = await getActivityAction({ before: oldest.createdAt });
        setItems((prev) => {
          // Deduplicate by id in case of edge overlaps.
          const seen = new Set(prev.map((i) => i.id));
          const merged = [...prev];
          for (const it of next.items) {
            if (!seen.has(it.id)) merged.push(it);
          }
          return merged;
        });
        setHasMore(next.hasMore);
      } catch {
        toast.error('Could not load more', 'Please try again.');
      }
    });
  };

  return (
    <div className="max-w-3xl mx-auto px-5 sm:px-8 py-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-xl font-semibold text-foreground">Activity</h1>
        <MarkAllReadButton />
      </div>

      {GROUP_ORDER.map((label) => {
        const list = groups.get(label) ?? [];
        return <ActivitySection key={label} label={label} items={list} />;
      })}

      {items.length === 0 ? null : hasMore ? (
        <div className="flex justify-center mt-6">
          <Button variant="outline" onClick={loadMore} disabled={pending}>
            {pending ? 'Loading…' : 'Load older activity'}
          </Button>
        </div>
      ) : (
        <p className="text-center text-xs text-muted-foreground mt-6">
          That&apos;s all your activity from the last 90 days.
        </p>
      )}
    </div>
  );
}
