import { BadgeCheck } from 'lucide-react';
import { cn } from '@/lib/cn';

interface VerifiedBadgeProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/**
 * Filled blue check that sits next to verified-account display names.
 * Manual allowlist via `constants/verifiedAccounts.ts` — there's no
 * user-facing verification flow yet, this is for the team / official
 * accounts. Pure visual; the actual allow check happens at the call
 * site so the badge can also be rendered eagerly when the caller
 * already knows the account is verified.
 */
export function VerifiedBadge({ size = 'md', className }: VerifiedBadgeProps) {
  const px = size === 'sm' ? 14 : size === 'lg' ? 22 : 18;
  return (
    <BadgeCheck
      size={px}
      // Fill stays primary regardless of theme so the badge reads as
      // an official signal, not as styled-with-the-page accent.
      className={cn('text-primary fill-primary/15 shrink-0', className)}
      aria-label="Verified account"
    />
  );
}
