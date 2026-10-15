'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { KeyRound, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

function ResetPasswordInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const token = sp.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (!token) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-6 py-12">
        <div className="max-w-md w-full text-center flex flex-col items-center gap-4">
          <XCircle className="w-12 h-12 text-destructive" />
          <h1 className="text-h2">Missing token</h1>
          <p className="text-muted-foreground text-sm max-w-sm">
            This page needs a valid reset link. Request a new one from the
            forgot-password page.
          </p>
          <Link href="/forgot-password" className="mt-2">
            <Button variant="outline">Request a new link</Button>
          </Link>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (password !== confirm) {
      setError('Passwords don’t match');
      return;
    }
    setPending(true);
    try {
      const res = await fetch('/api/v1/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword: password }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        setError(body?.message ?? 'Could not reset password. The link may have expired.');
        setPending(false);
        return;
      }
      // Success — send the user to signin. All sessions are now invalidated
      // server-side; they must sign in fresh with the new password.
      router.push('/signin?reset=success');
    } catch {
      setError('Network error. Please try again.');
      setPending(false);
    }
  };

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-6 py-12">
      <form onSubmit={handleSubmit} className="max-w-md w-full flex flex-col gap-5">
        <div className="flex items-center gap-3 mb-2">
          <KeyRound className="w-6 h-6 text-primary" />
          <h1 className="text-h2">Set a new password</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Choose a new password to sign in with. Existing sessions on all
          devices will be signed out.
        </p>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="new-password" className="text-sm font-medium">
            New password
          </label>
          <Input
            id="new-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            required
            autoFocus
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="confirm" className="text-sm font-medium">
            Confirm
          </label>
          <Input
            id="confirm"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Re-enter password"
            required
          />
        </div>
        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}
        <Button
          type="submit"
          disabled={!password || !confirm || pending}
          className="mt-2"
        >
          {pending ? 'Resetting…' : 'Reset password'}
        </Button>
      </form>
    </div>
  );
}

// useSearchParams() must sit under a Suspense boundary now that the (public)
// layout is static and this page can be statically prerendered — the CSR
// bailout would otherwise fail the build. The token resolves on the client.
export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordInner />
    </Suspense>
  );
}
