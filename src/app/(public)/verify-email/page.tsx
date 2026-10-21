import type { Metadata } from 'next';
import Link from 'next/link';
import { CheckCircle2, XCircle, MailCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { consumeEmailVerification } from '@/services/auth/verifyEmail';

export const metadata: Metadata = {
  title: 'Verify email',
  robots: { index: false, follow: false },
};

interface PageProps {
  searchParams: Promise<{ token?: string }>;
}

export default async function VerifyEmailPage({ searchParams }: PageProps) {
  const { token } = await searchParams;

  // Token consumption runs server-side on every page load. Single-use:
  // the row is deleted in the same DB call so a forwarded link can't be
  // redeemed twice. On success we render a success state; on failure
  // (missing/expired/already-used) we render a recoverable error state.
  let state: 'success' | 'invalid' | 'missing' = 'success';
  if (!token) {
    state = 'missing';
  } else {
    try {
      await consumeEmailVerification(token);
    } catch {
      state = 'invalid';
    }
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-6 py-12">
      <div className="max-w-md w-full text-center flex flex-col items-center gap-4">
        {state === 'success' ? (
          <>
            <CheckCircle2 className="w-12 h-12 text-emerald-400" />
            <h1 className="text-h2">Email verified</h1>
            <p className="text-muted-foreground text-sm max-w-sm">
              You&apos;re all set. Your Watchly account is now fully active.
            </p>
            <Link href="/programme" className="mt-2">
              <Button className="gap-2">Open Tonight&apos;s Programme</Button>
            </Link>
          </>
        ) : state === 'missing' ? (
          <>
            <MailCheck className="w-12 h-12 text-muted-foreground" />
            <h1 className="text-h2">Verify your email</h1>
            <p className="text-muted-foreground text-sm max-w-sm">
              Open the verification link in your inbox to confirm your email
              address. Didn&apos;t get the email? Sign in and request a new one.
            </p>
            <Link href="/signin" className="mt-2">
              <Button variant="outline">Sign in</Button>
            </Link>
          </>
        ) : (
          <>
            <XCircle className="w-12 h-12 text-destructive" />
            <h1 className="text-h2">This link is no longer valid</h1>
            <p className="text-muted-foreground text-sm max-w-sm">
              The verification link has expired or has already been used. Sign
              in and request a new one from the banner at the top of the app.
            </p>
            <Link href="/signin" className="mt-2">
              <Button variant="outline">Sign in</Button>
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
