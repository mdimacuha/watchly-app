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

// Links show the production origin; the wordmark loads from this server so
// the preview works before a deploy.
const PREVIEW_BASE = 'https://app.gowatchly.com';
const ASSET_BASE = process.env.PUBLIC_APP_URL || 'http://localhost:3000';
const site = { siteUrl: PREVIEW_BASE, assetUrl: ASSET_BASE };

export interface EmailPreviewEntry {
  slug: string;
  name: string;
  /** When it's sent and why. */
  description: string;
  subject: string;
  /** Rendered ReactElement using sample data. */
  element: ReactElement;
}

const deleteOn = new Date(Date.now() + 30 * 86_400_000).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

export const EMAIL_PREVIEWS: EmailPreviewEntry[] = [
  {
    slug: 'verify-email',
    name: 'Confirm your email',
    description: 'The only email at signup, and on resend. Token link, valid 24 hours; unverified accounts pause after the first week.',
    subject: 'Confirm your Watchly email',
    element: VerifyEmailEmail({ recipientName: null, verifyUrl: `${PREVIEW_BASE}/verify-email?token=preview_token_abc123`, ...site }),
  },
  {
    slug: 'welcome',
    name: 'Welcome',
    description: 'Sent once, the moment the email is confirmed. One button: Tonight’s Programme (UTM-tagged).',
    subject: 'You’re in. Tonight’s Programme is ready',
    element: WelcomeEmail({
      recipientName: 'Marc',
      programmeUrl: `${PREVIEW_BASE}/programme?utm_source=email&utm_medium=email&utm_campaign=welcome`,
      ...site,
    }),
  },
  {
    slug: 'password-reset',
    name: 'Reset your password',
    description: 'Sent from “Forgot your password?”. Always-200 endpoint, no enumeration. Token link, valid 1 hour, single use.',
    subject: 'Reset your Watchly password',
    element: PasswordResetEmail({ recipientName: 'Marc', resetUrl: `${PREVIEW_BASE}/reset-password?token=preview_token_xyz789`, ...site }),
  },
  {
    slug: 'restore-account',
    name: 'Scheduled for deletion',
    description: 'Sent when deletion is requested. Token link valid for the 30-day soft-delete window; shows the real deletion date.',
    subject: `Your Watchly account will be deleted on ${deleteOn}`,
    element: RestoreAccountEmail({ recipientName: 'Marc', restoreUrl: `${PREVIEW_BASE}/restore-account?token=preview_token_restore_42`, deleteOn, ...site }),
  },
];

export function findEmailPreview(slug: string): EmailPreviewEntry | undefined {
  return EMAIL_PREVIEWS.find((e) => e.slug === slug);
}
