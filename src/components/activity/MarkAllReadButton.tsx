'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/useToast';
import { markAllActivityReadAction } from '@/actions/activity';

export function MarkAllReadButton() {
  const toast = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    if (busy) return;
    setBusy(true);
    try {
      await markAllActivityReadAction();
      toast.success('Marked as read', 'All activity has been marked as read.');
      router.refresh();
    } catch {
      toast.error('Failed', 'Could not mark activity as read. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      className="text-sm font-medium text-primary hover:text-primary-hover transition-colors cursor-pointer disabled:opacity-50"
    >
      Mark all as read
    </button>
  );
}
