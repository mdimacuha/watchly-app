'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/useToast';
import { useAuthStore } from '@/client/stores/auth';
import { deleteAccountAction } from '@/actions/settings';

export function DeleteAccountClient() {
  const [confirmText, setConfirmText] = useState('');
  const [password, setPassword] = useState('');
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const clearAuth = useAuthStore((s) => s.clear);

  const phraseMatches = confirmText.trim().toUpperCase() === 'DELETE';

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!phraseMatches || !password) return;

    startTransition(async () => {
      try {
        await deleteAccountAction({ currentPassword: password });
        clearAuth();
        toast.success('Account scheduled for deletion');
        router.push('/');
      } catch (err) {
        toast.error(
          'Could not delete account',
          err instanceof Error ? err.message : 'Please try again.',
        );
      }
    });
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5 max-w-xl">
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 flex gap-3">
        <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
        <div className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-foreground">This will deactivate your account.</span>
          <span className="text-muted-foreground">
            Your data is kept for 30 days in case you change your mind. Contact
            support within that window to restore. After 30 days everything is
            permanently deleted.
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="confirm-phrase" className="text-sm font-medium">
          Type <span className="font-mono">DELETE</span> to confirm
        </label>
        <Input
          id="confirm-phrase"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder="DELETE"
          required
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="delete-password" className="text-sm font-medium">
          Current password
        </label>
        <Input
          id="delete-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push('/settings')}
          disabled={pending}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          variant="destructive"
          disabled={pending || !phraseMatches || !password}
          className="gap-2"
        >
          <Trash2 className="w-4 h-4" />
          {pending ? 'Deleting…' : 'Delete my account'}
        </Button>
      </div>
    </form>
  );
}
