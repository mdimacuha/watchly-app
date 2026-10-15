'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { markAllNotificationsReadAction } from '@/actions/notifications';

export function MarkAllNotificationsReadButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const handleClick = () => {
    startTransition(async () => {
      try {
        await markAllNotificationsReadAction();
        router.refresh();
      } catch {
        // Silent — the page refresh below would have repainted on success.
      }
    });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className="text-sm font-medium text-primary hover:underline underline-offset-2 disabled:opacity-60 cursor-pointer"
    >
      {pending ? 'Marking…' : 'Mark all as read'}
    </button>
  );
}
