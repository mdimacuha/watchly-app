'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/useToast';
import {
  changeEmailAction,
  changePasswordAction,
} from '@/actions/settings';

interface AccountSettingsClientProps {
  currentEmail: string;
}

export function AccountSettingsClient({ currentEmail }: AccountSettingsClientProps) {
  return (
    <div className="flex flex-col gap-10 max-w-xl">
      <ChangeEmailForm currentEmail={currentEmail} />
      <div className="border-t border-border/40" />
      <ChangePasswordForm />
    </div>
  );
}

function ChangeEmailForm({ currentEmail }: { currentEmail: string }) {
  const [email, setEmail] = useState(currentEmail);
  const [password, setPassword] = useState('');
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const router = useRouter();

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;

    startTransition(async () => {
      try {
        await changeEmailAction({ email: email.trim(), currentPassword: password });
        toast.success('Email updated', 'Verify the new email to keep it.');
        setPassword('');
        router.refresh();
      } catch (err) {
        toast.error(
          'Could not update email',
          err instanceof Error ? err.message : 'Please try again.',
        );
      }
    });
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <h2 className="text-h3">Change email</h2>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-sm font-medium">
          New email
        </label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email-pw" className="text-sm font-medium">
          Current password
        </label>
        <Input
          id="email-pw"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
      </div>
      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={pending || !email.trim() || !password || email === currentEmail}
        >
          {pending ? 'Saving…' : 'Update email'}
        </Button>
      </div>
    </form>
  );
}

function ChangePasswordForm() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!current || !next || !confirm) return;
    if (next !== confirm) {
      toast.error('Passwords don\'t match', 'Please confirm your new password.');
      return;
    }

    startTransition(async () => {
      try {
        await changePasswordAction({ currentPassword: current, newPassword: next });
        toast.success(
          'Password updated',
          'Other devices have been signed out.',
        );
        setCurrent('');
        setNext('');
        setConfirm('');
      } catch (err) {
        toast.error(
          'Could not update password',
          err instanceof Error ? err.message : 'Please try again.',
        );
      }
    });
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <h2 className="text-h3">Change password</h2>
      <p className="text-xs text-muted-foreground">
        Changing your password will sign out your other devices.
      </p>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="pw-current" className="text-sm font-medium">
          Current password
        </label>
        <Input
          id="pw-current"
          type="password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          autoComplete="current-password"
          required
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="pw-new" className="text-sm font-medium">
          New password
        </label>
        <Input
          id="pw-new"
          type="password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          autoComplete="new-password"
          minLength={8}
          required
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="pw-confirm" className="text-sm font-medium">
          Confirm new password
        </label>
        <Input
          id="pw-confirm"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          minLength={8}
          required
        />
      </div>
      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={pending || !current || !next || !confirm}
        >
          {pending ? 'Saving…' : 'Update password'}
        </Button>
      </div>
    </form>
  );
}
