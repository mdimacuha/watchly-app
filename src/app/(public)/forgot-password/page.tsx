'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Mail, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || pending) return;
    setPending(true);
    try {
      await fetch('/api/v1/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
    } finally {
      // Always show the same success state — server intentionally doesn't
      // distinguish between known and unknown emails (no enumeration).
      setSubmitted(true);
      setPending(false);
    }
  };

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-6 py-12">
      <div className="max-w-md w-full">
        {submitted ? (
          <div className="text-center flex flex-col items-center gap-4">
            <CheckCircle2 className="w-12 h-12 text-emerald-400" />
            <h1 className="text-h2">Check your inbox</h1>
            <p className="text-muted-foreground text-sm max-w-sm">
              If an account exists for that email, we&apos;ve sent a password
              reset link. It expires in 1 hour.
            </p>
            <Link href="/signin" className="mt-2">
              <Button variant="outline">Back to sign in</Button>
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div className="flex items-center gap-3 mb-2">
              <Mail className="w-6 h-6 text-primary" />
              <h1 className="text-h2">Forgot your password?</h1>
            </div>
            <p className="text-sm text-muted-foreground">
              Enter the email tied to your Watchly account and we&apos;ll
              send a reset link.
            </p>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="text-sm font-medium">
                Email
              </label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoFocus
              />
            </div>
            <Button type="submit" disabled={!email || pending} className="mt-2">
              {pending ? 'Sending…' : 'Send reset link'}
            </Button>
            <Link
              href="/signin"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors text-center"
            >
              Back to sign in
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}
