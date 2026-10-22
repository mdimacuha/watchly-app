import 'server-only';

import type { ReactElement } from 'react';
import { VerifyEmailEmail } from '@/server/email/templates/VerifyEmailEmail';
import { PasswordResetEmail } from '@/server/email/templates/PasswordResetEmail';
import { RestoreAccountEmail } from '@/server/email/templates/RestoreAccountEmail';
import { WelcomeEmail } from '@/server/email/templates/WelcomeEmail';

/**
 * Registry of every transactional + marketing email template, keyed by
 * a URL-safe slug. Each entry carries a fully-rendered `<Template/>`
 * element with realistic sample props so the preview route can render
 * without any extra wiring.
 *
 * Adding a new template: drop a file in `src/server/email/templates/`
 * and add a row here.
 */

const PREVIEW_BASE = 'https://watchly.dayonelabs.co';

export interface EmailPreviewEntry {
  slug: string;
  name: string;
  description: string;
  subject: string;
  /** Rendered ReactElement using sample data. */
  element: ReactElement;
}

export const EMAIL_PREVIEWS: EmailPreviewEntry[] = [
  {
    slug: 'welcome',
    name: 'Welcome',
    description:
      'Marketing-style onboarding email fired once on signup, alongside the verify email.',
    subject: 'Welcome to Watchly',
    element: WelcomeEmail({
      recipientName: 'Marc',
      searchUrl: `${PREVIEW_BASE}/discover`,
    }),
  },
  {
    slug: 'verify-email',
    name: 'Verify email',
    description:
      'Transactional: sent on signup + on resend. Token-bearing link expires in 24h.',
    subject: 'Verify your Watchly email',
    element: VerifyEmailEmail({
      recipientName: 'Marc',
      verifyUrl: `${PREVIEW_BASE}/verify-email?token=preview_token_abc123`,
    }),
  },
  {
    slug: 'password-reset',
    name: 'Password reset',
    description:
      'Transactional: sent on /forgot-password. Always-200 endpoint, no-enumeration.',
    subject: 'Reset your Watchly password',
    element: PasswordResetEmail({
      recipientName: 'Marc',
      resetUrl: `${PREVIEW_BASE}/reset-password?token=preview_token_xyz789`,
    }),
  },
  {
    slug: 'restore-account',
    name: 'Restore account',
    description:
      'Transactional: sent at account-delete time. 30-day TTL matches the soft-delete window.',
    subject: 'Restore your Watchly account',
    element: RestoreAccountEmail({
      recipientName: 'Marc',
      restoreUrl: `${PREVIEW_BASE}/restore-account?token=preview_token_restore_42`,
    }),
  },
];

export function findEmailPreview(slug: string): EmailPreviewEntry | undefined {
  return EMAIL_PREVIEWS.find((e) => e.slug === slug);
}
