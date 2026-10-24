import type { Metadata } from 'next';
import Link from 'next/link';
import { CheckCircle2, XCircle, MailCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getSessionWithUser } from '@/server/auth/session';
import { TokenConfirm } from '@/components/auth/TokenConfirm';

export const metadata: Metadata = {
  title: 'Verify email',
  robots: { index: false, follow: false },
};

interface PageProps {
  searchParams: Promise<{ token?: string }>;
}

const verified = {
  icon: <CheckCircle2 className="h-12 w-12 text-emerald-400" />,
  title: 'Email confirmed',
  body: 'You’re all set. Your Watchly account is yours to keep.',
  cta: { label: 'Open Tonight’s Programme', href: '/programme' },
};

// The token is used only when the person presses Confirm (see TokenConfirm:
// mail scanners open links, they don't press buttons).
export default async function VerifyEmailPage({ searchParams }: PageProps) {
  const { token } = await searchParams;
  const current = await getSessionWithUser().catch(() => null);

  // Already verified (on this device): nothing to confirm, whatever the link.
  if (current?.user.isVerified) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-6 py-12">
        <div className="flex w-full max-w-md flex-col items-center gap-4 text-center">
          {verified.icon}
          <h1 className="text-h2">{verified.title}</h1>
          <p className="max-w-sm text-sm text-muted-foreground">{verified.body}</p>
          <Link href={verified.cta.href} className="mt-2">
            <Button>{verified.cta.label}</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-6 py-12">
        <div className="flex w-full max-w-md flex-col items-center gap-4 text-center">
          <MailCheck className="h-12 w-12 text-muted-foreground" />
          <h1 className="text-h2">Confirm your email</h1>
          <p className="max-w-sm text-sm text-muted-foreground">
            Open the link in the email we sent you. Didn&apos;t get it? Sign in and send a new one from the banner at the top of the app.
          </p>
          <Link href="/signin" className="mt-2">
            <Button variant="outline">Sign in</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <TokenConfirm
      endpoint="/api/v1/auth/verify-email"
      token={token}
      ask={{
        icon: <MailCheck className="h-12 w-12 text-muted-foreground" />,
        title: 'Confirm your email',
        body: 'One tap and your Watchly account is yours to keep.',
        action: 'Confirm email',
      }}
      done={verified}
      failed={{
        icon: <XCircle className="h-12 w-12 text-destructive" />,
        title: 'This link is no longer valid',
        body: 'It has expired or was already used. Sign in and send a new one from the banner at the top of the app.',
        cta: { label: 'Sign in', href: '/signin' },
      }}
    />
  );
}
