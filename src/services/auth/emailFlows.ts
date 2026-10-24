import 'server-only';

import { db } from '@/db';
import { userProfiles, users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { env } from '@/env';
import { SITE_URL } from '@/lib/seo';
import { sendMail } from '@/server/email';
import { VerifyEmailEmail } from '@/server/email/templates/VerifyEmailEmail';
import { PasswordResetEmail } from '@/server/email/templates/PasswordResetEmail';
import { RestoreAccountEmail } from '@/server/email/templates/RestoreAccountEmail';
import { WelcomeEmail } from '@/server/email/templates/WelcomeEmail';
import { createToken, getLatestTokenIssuedAt } from './tokens';

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

const EMAIL_VERIFY_TTL_SECONDS = 60 * 60 * 24; // 24h
const PASSWORD_RESET_TTL_SECONDS = 60 * 60; // 1h
const ACCOUNT_RESTORE_TTL_SECONDS = 60 * 60 * 24 * 30; // 30d

const RESEND_COOLDOWN_SECONDS = 60;

/**
 * On no-op email branches (unknown address / nothing to send), sleep a
 * random amount in this window before returning. Together with the
 * always-200 response shape this masks the timing channel that would
 * otherwise leak account existence to a caller comparing response times.
 */
const ENUM_JITTER_MIN_MS = 80;
const ENUM_JITTER_MAX_MS = 260;

async function enumerationJitter(): Promise<void> {
  const delta = ENUM_JITTER_MAX_MS - ENUM_JITTER_MIN_MS;
  const ms = ENUM_JITTER_MIN_MS + Math.floor(Math.random() * delta);
  await new Promise((r) => setTimeout(r, ms));
}

/**
 * Base origin for transactional email links (verify / reset / restore / welcome).
 *
 * Production pins to the canonical app origin (`SITE_URL` = app.gowatchly.com,
 * the migration target) — deliberately NOT `env.PUBLIC_APP_URL`, which in prod
 * is still the deprecated `watchly.dayonelabs.co` host, so links would have kept
 * sending users to the old domain. Both domains serve the app, so a token link
 * works either way; pointing at the new one moves users onto it. Non-prod keeps
 * `PUBLIC_APP_URL || localhost` so the local mail-trap flow stays testable
 * end-to-end against the dev server. Override the prod origin via
 * `NEXT_PUBLIC_SITE_URL` (same knob as the SEO canonical) if it ever changes.
 */
function appUrl(): string {
  if (env.NODE_ENV === 'production') return SITE_URL;
  return env.PUBLIC_APP_URL || 'http://localhost:3000';
}

interface UserContactRow {
  id: string;
  email: string;
  /**
   * The name to greet with: the profile's display name (the first run's
   * "Name on the stub"), or null. Never users.firstName — new accounts store
   * the username there — and never the username itself: "Hi there" beats
   * "Hi film.lover".
   */
  name: string | null;
}

const contactColumns = { id: users.id, email: users.email, displayName: userProfiles.displayName, username: users.username };

function toContact(row: { id: string; email: string; displayName: string | null; username: string } | undefined): UserContactRow | null {
  if (!row) return null;
  const display = row.displayName?.trim() ?? '';
  return { id: row.id, email: row.email, name: display && display !== row.username ? display : null };
}

async function loadContactByUserId(userId: string): Promise<UserContactRow | null> {
  const [row] = await db
    .select(contactColumns)
    .from(users)
    .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
    .where(eq(users.id, userId))
    .limit(1);
  return toContact(row);
}

async function loadContactByEmail(email: string): Promise<UserContactRow | null> {
  const [row] = await db
    .select(contactColumns)
    .from(users)
    .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
    .where(eq(users.email, email))
    .limit(1);
  return toContact(row);
}

/** Analytics tags for links that carry no token (never on token links: they'd leak into referrers). */
function tagged(path: string, campaign: string): string {
  return `${appUrl()}${path}?utm_source=email&utm_medium=email&utm_campaign=${campaign}`;
}

// ---------------------------------------------------------------------------
// Email verification
// ---------------------------------------------------------------------------

export class CooldownError extends Error {
  constructor(public retryAfterSeconds: number) {
    super(`Resend cooldown active. Try again in ${retryAfterSeconds}s.`);
    this.name = 'CooldownError';
  }
}

/**
 * Issue a verification token and send the email. Used on signup AND on
 * resend (which adds a cooldown). When `respectCooldown` is true, throws
 * CooldownError if the user issued a token less than RESEND_COOLDOWN_SECONDS
 * ago — caller can surface "Try again in N seconds".
 */
export async function sendVerificationEmail(
  userId: string,
  opts: { respectCooldown?: boolean } = {},
): Promise<void> {
  const contact = await loadContactByUserId(userId);
  if (!contact) return;

  if (opts.respectCooldown) {
    const lastIssued = await getLatestTokenIssuedAt({
      userId,
      purpose: 'email_verification',
    });
    if (lastIssued) {
      const elapsed = (Date.now() - lastIssued.getTime()) / 1000;
      if (elapsed < RESEND_COOLDOWN_SECONDS) {
        throw new CooldownError(
          Math.ceil(RESEND_COOLDOWN_SECONDS - elapsed),
        );
      }
    }
  }

  const { token } = await createToken({
    userId,
    purpose: 'email_verification',
    ttlSeconds: EMAIL_VERIFY_TTL_SECONDS,
  });

  const verifyUrl = `${appUrl()}/verify-email?token=${encodeURIComponent(token)}`;

  await sendMail({
    to: contact.email,
    subject: 'Confirm your Watchly email',
    template: VerifyEmailEmail({
      recipientName: contact.name,
      verifyUrl,
      siteUrl: appUrl(),
    }),
  });
}

/**
 * The welcome, sent once, the moment the email is confirmed (not at signup,
 * where it would compete with the verify email's deadline). By then the
 * first run has usually set their name. No-ops if the user is gone.
 */
export async function sendWelcomeEmail(userId: string): Promise<void> {
  const contact = await loadContactByUserId(userId);
  if (!contact) return;

  await sendMail({
    to: contact.email,
    subject: 'You’re in. Tonight’s Programme is ready',
    template: WelcomeEmail({
      recipientName: contact.name,
      programmeUrl: tagged('/programme', 'welcome'),
      siteUrl: appUrl(),
    }),
  });
}

// ---------------------------------------------------------------------------
// Password reset
// ---------------------------------------------------------------------------

/**
 * Initiate a password reset. Never throws on "no such email" — returns
 * silently to avoid leaking which email addresses are registered. Caller
 * always shows the same success message.
 */
export async function sendPasswordResetEmail(email: string): Promise<void> {
  const contact = await loadContactByEmail(email);
  if (!contact) {
    // Silent no-op. The DB lookup is fast; padding with random jitter
    // hides the timing delta vs the "did send an email" branch so
    // callers can't infer account existence from response time.
    await enumerationJitter();
    return;
  }

  const { token } = await createToken({
    userId: contact.id,
    purpose: 'password_reset',
    ttlSeconds: PASSWORD_RESET_TTL_SECONDS,
  });

  const resetUrl = `${appUrl()}/reset-password?token=${encodeURIComponent(token)}`;

  await sendMail({
    to: contact.email,
    subject: 'Reset your Watchly password',
    template: PasswordResetEmail({
      recipientName: contact.name,
      resetUrl,
      siteUrl: appUrl(),
    }),
  });
}

// ---------------------------------------------------------------------------
// Account restore
// ---------------------------------------------------------------------------

/**
 * Issue + send the restore link sent at delete-account time. The user's
 * row is already soft-deleted by the deleteAccount flow; this is the only
 * channel they have to come back. 30-day TTL matches the soft-delete window.
 */
export async function sendRestoreAccountEmail(userId: string): Promise<void> {
  const contact = await loadContactByUserId(userId);
  if (!contact) {
    await enumerationJitter();
    return;
  }

  const { token } = await createToken({
    userId,
    purpose: 'account_restore',
    ttlSeconds: ACCOUNT_RESTORE_TTL_SECONDS,
  });

  const restoreUrl = `${appUrl()}/restore-account?token=${encodeURIComponent(token)}`;
  // The day the restore link (and the soft-delete window) runs out.
  const deleteOn = new Date(Date.now() + ACCOUNT_RESTORE_TTL_SECONDS * 1000).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });

  await sendMail({
    to: contact.email,
    subject: `Your Watchly account will be deleted on ${deleteOn}`,
    template: RestoreAccountEmail({
      recipientName: contact.name,
      restoreUrl,
      deleteOn,
      siteUrl: appUrl(),
    }),
  });
}
