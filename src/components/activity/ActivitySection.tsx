import type { ActivityGroupLabel, ActivityItem } from '@/services/activity/types';
import { ActivityRow } from './ActivityRow';

interface ActivitySectionProps {
  label: ActivityGroupLabel;
  items: ActivityItem[];
}

export function ActivitySection({ label, items }: ActivitySectionProps) {
  if (items.length === 0) return null;

  return (
    <section className="mb-8">
      <h3 className="text-xs font-medium tracking-wider text-muted-foreground uppercase mb-1 px-1">
        {label}
      </h3>

      <div className="divide-y divide-border/30">
        {items.map((item) => (
          <ActivityRow key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
}
