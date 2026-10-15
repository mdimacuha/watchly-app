import 'server-only';
import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '@/env';

let cached: Transporter | null = null;

/**
 * Returns a nodemailer transport pointed at a local SMTP trapper
 * (MailHog / Mailpit). MailHog listens for SMTP on port **1025** by
 * default and exposes its inbox web UI on **8025** — `SMTP_PORT` must
 * be 1025, NOT 8025, or nodemailer will hang trying to speak SMTP to
 * the HTTP listener.
 *
 * Returns null in production to avoid accidental connection attempts to
 * a non-existent SMTP server on prod hosts.
 */
export function getMailhogTransporter(): Transporter | null {
  if (env.NODE_ENV === 'production') return null;
  if (cached) return cached;
  cached = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: false,
    ignoreTLS: true,
  });
  return cached;
}
