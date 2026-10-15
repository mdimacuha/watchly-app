import type { Metadata } from 'next';
import Link from 'next/link';
import { CheckCircle2, XCircle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { restoreAccount } from '@/services/auth/restoreAccount';

export const metadata: Metadata = {
  title: 'Restore account',
  robots: { index: false, follow: false },
};

interface PageProps {
  searchParams: Promise<{ token?: string }>;
}

export default async function RestoreAccountPage({ searchParams }: PageProps) {
  const { token } = await searchParams;

  let state: 'success' | 'invalid' | 'missing' = 'success';
  if (!token) {
    state = 'missing';
  } else {
    try {
      await restoreAccount(token);
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
            <h1 className="text-h2">Welcome back</h1>
            <p className="text-muted-foreground text-sm max-w-sm">
              Your account is restored. Sign in to pick up exactly where you
              left off — your watchlists, favorites, and activity are intact.
            </p>
            <Link href="/signin" className="mt-2">
              <Button className="gap-2">Sign in</Button>
            </Link>
          </>
        ) : state === 'missing' ? (
          <>
            <RotateCcw className="w-12 h-12 text-muted-foreground" />
            <h1 className="text-h2">Open your restore link</h1>
            <p className="text-muted-foreground text-sm max-w-sm">
              This page needs a valid restore link from the email we sent
              you when your account was scheduled for deletion.
            </p>
          </>
        ) : (
          <>
            <XCircle className="w-12 h-12 text-destructive" />
            <h1 className="text-h2">This restore link is no longer valid</h1>
            <p className="text-muted-foreground text-sm max-w-sm">
              The link has expired or has already been used. The 30-day
              restore window may have passed — if so your account data has
              been permanently removed.
            </p>
            <Link href="/signin" className="mt-2">
              <Button variant="outline">Back to sign in</Button>
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
