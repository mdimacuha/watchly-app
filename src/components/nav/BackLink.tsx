'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/cn';

interface BackLinkProps {
  /** Where to go when there's no same-origin history to return to. */
  fallbackHref?: string;
  /** Visible label + accessible name. */
  label?: string;
  className?: string;
}

/**
 * Consistent back navigation used across detail/sub pages.
 *
 * Promotes the logic from `BackButton`: if we arrived from a same-origin
 * page, go back in history so the user lands exactly where they were.
 * Otherwise (deep link, fresh tab, cross-origin referrer) push a known-safe
 * fallback route so the user is never trapped.
 */
export function BackLink({
  fallbackHref = '/programme',
  label = 'Back',
  className,
}: BackLinkProps) {
  const router = useRouter();

  const handleBack = () => {
    // Go back only when there's genuinely somewhere same-origin to return to:
    // a populated history stack (so a fresh tab with no history doesn't call
    // router.back() into nothing) AND a same-origin referrer (so we don't
    // bounce the user off-site). Otherwise land on a known-safe fallback so
    // the user is never trapped.
    if (
      typeof window !== 'undefined' &&
      window.history.length > 1 &&
      document.referrer &&
      new URL(document.referrer).origin === window.location.origin
    ) {
      router.back();
    } else {
      router.push(fallbackHref);
    }
  };

  return (
    <button
      type="button"
      onClick={handleBack}
      aria-label={label}
      className={cn(
        'inline-flex items-center gap-2 w-fit text-sm font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer',
        className,
      )}
    >
      <ArrowLeft size={18} />
      <span>{label}</span>
    </button>
  );
}
