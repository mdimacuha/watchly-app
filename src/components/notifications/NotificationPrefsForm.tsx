'use client';

import { useState, useTransition } from 'react';
import { UserPlus, Sparkles, BellRing } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useToast } from '@/hooks/useToast';
import { updateNotificationPreferencesAction } from '@/actions/notifPreferences';
import type { ResolvedNotificationPrefs } from '@/services/notifications/preferences';

interface NotificationPrefsFormProps {
  initial: ResolvedNotificationPrefs;
}

interface Row {
  key: keyof ResolvedNotificationPrefs;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  description: string;
}

const ROWS: Row[] = [
  {
    key: 'follow_events',
    icon: UserPlus,
    label: 'Follow events',
    description:
      'New follower, follow request, and follow-accepted notifications.',
  },
  {
    key: 'follow_activity',
    icon: Sparkles,
    label: 'Activity from people you follow',
    description:
      "When someone you follow adds a title, favorites something, or makes a new watchlist. Throttled so you don't get spammed.",
  },
  {
    key: 'title_alerts',
    icon: BellRing,
    label: 'Title alerts',
    description:
      'The "Notify me when" alerts you set on titles: a title starts streaming, leaves a service, or a new season airs.',
  },
];

export function NotificationPrefsForm({ initial }: NotificationPrefsFormProps) {
  const [prefs, setPrefs] = useState(initial);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  const handleToggle = (key: keyof ResolvedNotificationPrefs) => {
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    startTransition(async () => {
      try {
        await updateNotificationPreferencesAction({ [key]: next[key] });
      } catch {
        // Roll back optimism — server is the source of truth.
        setPrefs(prefs);
        toast.error('Could not save', 'Please try again.');
      }
    });
  };

  return (
    <div className="flex flex-col gap-3">
      {ROWS.map((row) => {
        const value = prefs[row.key];
        return (
          <button
            key={row.key}
            type="button"
            onClick={() => handleToggle(row.key)}
            disabled={pending}
            className={cn(
              'flex items-center gap-4 p-4 rounded-lg border text-left transition-colors cursor-pointer',
              value
                ? 'border-primary/40 bg-primary/5'
                : 'border-border hover:border-foreground/40 hover:bg-card/60',
              pending && 'opacity-70',
            )}
          >
            <row.icon
              size={20}
              className={cn(
                'shrink-0',
                value ? 'text-primary' : 'text-muted-foreground',
              )}
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">
                {row.label}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {row.description}
              </p>
            </div>
            {/* Pill switch */}
            <div
              className={cn(
                'relative w-10 h-6 rounded-full transition-colors shrink-0',
                value ? 'bg-primary' : 'bg-muted',
              )}
            >
              <span
                className={cn(
                  'absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform',
                  value && 'translate-x-4',
                )}
              />
            </div>
          </button>
        );
      })}
    </div>
  );
}
