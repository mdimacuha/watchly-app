'use client';

import { useEffect, useState, useTransition } from 'react';
import { AlertCircle, MailCheck, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useToast } from '@/hooks/useToast';
import { getVerificationStatusAction } from '@/actions/verification';
import type { VerificationStatus } from '@/services/auth/verificationGate';

const SESSION_DISMISS_KEY = 'watchly_verify_banner_dismissed';

/**
 * Soft banner at the top of the authed shell prompting unverified users
 * to verify their email. Two visual states:
 *   - within 7-day grace: dismissible (per-tab session), amber tone
 *   - past grace: NOT dismissible, destructive tone, primary actions are
 *     already blocked server-side via requireVerifiedOrInGrace
 */
export function VerificationBanner() {
  const [status, setStatus] = useState<VerificationStatus | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  // Pull status on mount. The action returns null for unauth requests so
  // the banner stays hidden on public pages even though it's rendered.
  // sessionStorage is client-only so the dismiss check has to happen here
  // — there's no derive-from-props alternative for this kind of external
  // state.
  useEffect(() => {
    getVerificationStatusAction()
      .then((s) => setStatus(s))
      .catch(() => setStatus(null));
    if (typeof window !== 'undefined') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDismissed(window.sessionStorage.getItem(SESSION_DISMISS_KEY) === '1');
    }
  }, []);

  if (!status || status.isVerified) return null;
  if (dismissed && !status.isPastGrace) return null;

  const handleResend = () => {
    startTransition(async () => {
      try {
        const res = await fetch('/api/v1/auth/verify-email/resend', {
          method: 'POST',
        });
        if (res.ok) {
          toast.success('Sent', 'Check your inbox for the verification link.');
        } else {
          const body = (await res.json().catch(() => null)) as
            | { message?: string }
            | null;
          toast.error(
            'Resend failed',
            body?.message ?? 'Please try again in a moment.',
          );
        }
      } catch {
        toast.error('Resend failed', 'Please try again in a moment.');
      }
    });
  };

  const handleDismiss = () => {
    setDismissed(true);
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(SESSION_DISMISS_KEY, '1');
    }
  };

  return (
    <div
      className={cn(
        'flex items-center gap-3 px-4 py-2.5 text-sm border-b',
        'sticky top-0 z-50 backdrop-blur-2xl',
        status.isPastGrace
          ? 'bg-destructive/20 border-destructive/30 text-destructive-foreground'
          : 'bg-amber-500/80 border-amber-500/30 text-amber-100 light:text-amber-900 light:bg-amber-100 light:border-amber-300',
      )}
    >
      {status.isPastGrace ? (
        <AlertCircle className="w-4 h-4 shrink-0" />
      ) : (
        <MailCheck className="w-4 h-4 shrink-0" />
      )}
      <span className="flex-1 min-w-0">
        {status.isPastGrace
          ? 'Verify your email to continue using Watchly.'
          : 'Verify your email to keep using Watchly past the trial week.'}
      </span>
      <button
        type="button"
        onClick={handleResend}
        disabled={pending}
        className="underline-offset-2 hover:underline font-medium disabled:opacity-60 cursor-pointer"
      >
        {pending ? 'Sending…' : 'Resend link'}
      </button>
      {!status.isPastGrace && (
        <button
          type="button"
          onClick={handleDismiss}
          className="opacity-60 hover:opacity-100 cursor-pointer"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
