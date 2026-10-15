// Thin sendMail wrapper used by every email-sender service. Renders a
// React Email template to HTML + plain-text, then dispatches via the
// configured transport. Selection rules:
//
//   * NODE_ENV !== 'production' → MailHog / local SMTP, ALWAYS.
//     Test signups must never leak to a real provider, even when a
//     RESEND_API_KEY happens to be present in `.env` (e.g. copied from
//     a prod secrets file).
//   * NODE_ENV === 'production' → Resend if RESEND_API_KEY is set,
//     otherwise log + no-op (with a visible warn so the gap is
//     diagnosable).
//
// Per-recipient errors are swallowed so a failed email never crashes the
// calling flow.
import 'server-only';
import { render } from '@react-email/components';
import type { ReactElement } from 'react';
import { env } from '@/env';
import { logger } from '@/lib/log';
import { getResend, EmailError } from './client';
import { getMailhogTransporter } from './mailhog';

export interface SendMailInput {
  to: string;
  subject: string;
  /** React Email component to render. */
  template: ReactElement;
}

/**
 * Send a transactional email. Returns true on successful dispatch (Resend
 * accepted OR MailHog accepted), false on a soft fall-through (no
 * transport available — typically prod misconfiguration).
 */
export async function sendMail({
  to,
  subject,
  template,
}: SendMailInput): Promise<boolean> {
  const from = env.EMAIL_FROM;

  // React Email's `render` is async in v0.0.20+. Both HTML + plain-text
  // fallbacks help deliverability and let MailHog show readable previews.
  const [html, text] = await Promise.all([
    render(template),
    render(template, { plainText: true }),
  ]);

  const isProd = env.NODE_ENV === 'production';

  // DEV: MailHog only. Resend is intentionally bypassed even when its
  // key is set — local dev should never reach a real recipient.
  if (!isProd) {
    const smtp = getMailhogTransporter();
    if (!smtp) {
      logger.warn(
        '[email] no MailHog transporter in dev — check SMTP_HOST/SMTP_PORT',
        { to, subject, host: env.SMTP_HOST, port: env.SMTP_PORT },
      );
      return false;
    }
    try {
      await smtp.sendMail({ from, to, subject, html, text });
      logger.info('[email] trapped via MailHog', {
        to,
        subject,
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
      });
      return true;
    } catch (err) {
      logger.error('[email] mailhog send failed', err, {
        to,
        subject,
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
      });
      return false;
    }
  }

  // PROD: Resend if configured, otherwise loud warn + no-op.
  const resend = getResend();
  if (resend) {
    try {
      const res = await resend.emails.send({ from, to, subject, html, text });
      if (res.error) {
        throw new EmailError(
          `Resend returned error: ${res.error.message}`,
          res.error,
        );
      }
      return true;
    } catch (err) {
      logger.error('[email] resend send failed', err, { to, subject });
      return false;
    }
  }

  logger.warn(
    '[email] no transport configured — set RESEND_API_KEY in production',
    { to, subject },
  );
  return false;
}
