import type { Metadata } from 'next';
import { CheckCircle2, XCircle, RotateCcw } from 'lucide-react';
import { TokenConfirm } from '@/components/auth/TokenConfirm';

export const metadata: Metadata = {
  title: 'Restore account',
  robots: { index: false, follow: false },
};

interface PageProps {
  searchParams: Promise<{ token?: string }>;
}

// Restoring waits for the button: a mail scanner opening the link must never
// cancel a deletion the person asked for.
export default async function RestoreAccountPage({ searchParams }: PageProps) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-6 py-12">
        <div className="flex w-full max-w-md flex-col items-center gap-4 text-center">
          <RotateCcw className="h-12 w-12 text-muted-foreground" />
          <h1 className="text-h2">Open your restore link</h1>
          <p className="max-w-sm text-sm text-muted-foreground">
            This page needs the restore link from the email we sent when your account was scheduled for deletion.
          </p>
        </div>
      </div>
    );
  }

  return (
    <TokenConfirm
      endpoint="/api/v1/auth/restore-account"
      token={token}
      ask={{
        icon: <RotateCcw className="h-12 w-12 text-muted-foreground" />,
        title: 'Restore your account?',
        body: 'Your account comes back exactly as you left it: watchlists, favorites, likes and activity. The deletion is cancelled.',
        action: 'Restore my account',
      }}
      done={{
        icon: <CheckCircle2 className="h-12 w-12 text-emerald-400" />,
        title: 'Welcome back',
        body: 'Your account is restored. Sign in to pick up exactly where you left off.',
        cta: { label: 'Sign in', href: '/signin' },
      }}
      failed={{
        icon: <XCircle className="h-12 w-12 text-destructive" />,
        title: 'This restore link is no longer valid',
        body: 'It has expired or was already used. If the 30-day window has passed, the account has been permanently deleted.',
        cta: { label: 'Back to sign in', href: '/signin' },
      }}
    />
  );
}
