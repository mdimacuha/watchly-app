'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Power, PowerOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/useToast';
import {
  startMaintenanceAction,
  endMaintenanceAction,
} from '@/actions/maintenance';

interface MaintenanceToggleClientProps {
  active: boolean;
}

/**
 * Start / stop maintenance from the debug page. The Start path
 * requires a reason; Stop is a single click. After either action we
 * router.refresh() so the page re-renders with the new active state
 * (the action already bust the cache tag).
 */
export function MaintenanceToggleClient({ active }: MaintenanceToggleClientProps) {
  const [reason, setReason] = useState('Quick maintenance — back shortly.');
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();

  const handleStart = () => {
    if (!reason.trim()) {
      toast.error('Reason required', 'Tell users why the app is down.');
      return;
    }
    startTransition(async () => {
      try {
        await startMaintenanceAction(reason.trim());
        toast.success('Maintenance ON', 'The app now shows the maintenance screen.');
        router.refresh();
      } catch (err) {
        toast.error(
          'Could not start',
          err instanceof Error ? err.message : 'Please try again.',
        );
      }
    });
  };

  const handleStop = () => {
    startTransition(async () => {
      try {
        await endMaintenanceAction();
        toast.success('Maintenance OFF', 'The app is back online.');
        router.refresh();
      } catch (err) {
        toast.error(
          'Could not stop',
          err instanceof Error ? err.message : 'Please try again.',
        );
      }
    });
  };

  if (active) {
    return (
      <Button
        onClick={handleStop}
        disabled={pending}
        variant="outline"
        className="gap-2 self-start mt-2"
      >
        {pending ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <PowerOff className="w-4 h-4" />
        )}
        Stop maintenance
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2 mt-2">
      <label
        htmlFor="maintenance-reason"
        className="text-sm font-medium text-foreground"
      >
        Reason
      </label>
      <textarea
        id="maintenance-reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
        placeholder="What you want users to see on the maintenance screen."
      />
      <Button
        onClick={handleStart}
        disabled={pending}
        className="gap-2 self-start mt-1"
      >
        {pending ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Power className="w-4 h-4" />
        )}
        Start maintenance
      </Button>
    </div>
  );
}
