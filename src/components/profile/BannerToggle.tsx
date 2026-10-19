'use client';

import { useEffect, useState, useTransition } from 'react';
import { ImageIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useToast } from '@/hooks/useToast';
import { setBannerEnabledAction } from '@/actions/profileBanner';
import { getMyProfileAction } from '@/actions/profile';

/**
 * Toggle for the profile-banner feature in Settings → Appearance.
 * Self-fetches the current state on mount so the parent page can stay
 * client-only without piping the value down.
 */
export function BannerToggle() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  useEffect(() => {
    getMyProfileAction()
      .then((p) => {
        setEnabled(p.bannerEnabled);
      })
      .catch(() => {
        setEnabled(true);
      });
  }, []);

  if (enabled === null) {
    return (
      <div className="rounded-lg border border-border p-4 animate-pulse">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  const handleToggle = () => {
    const next = !enabled;
    setEnabled(next); // optimistic
    startTransition(async () => {
      try {
        await setBannerEnabledAction(next);
      } catch {
        setEnabled(!next); // rollback
        toast.error('Could not save', 'Please try again.');
      }
    });
  };

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={pending}
      className={cn(
        'flex items-center gap-4 p-4 rounded-lg border text-left transition-colors cursor-pointer w-full',
        enabled
          ? 'border-primary/40 bg-primary/5'
          : 'border-border hover:border-foreground/40 hover:bg-card/60',
        pending && 'opacity-70',
      )}
    >
      <ImageIcon
        size={20}
        className={cn(
          'shrink-0',
          enabled ? 'text-primary' : 'text-muted-foreground',
        )}
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground">
          Profile banner from your favorites
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Render a blurred poster collage at the top of your profile page,
          derived from your top favorites. Falls back to the plain accent
          when off.
        </p>
      </div>
      <div
        className={cn(
          'relative w-10 h-6 rounded-full transition-colors shrink-0',
          enabled ? 'bg-primary' : 'bg-muted',
        )}
      >
        <span
          className={cn(
            'absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform',
            enabled && 'translate-x-4',
          )}
        />
      </div>
    </button>
  );
}
