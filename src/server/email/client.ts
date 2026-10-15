// Resend transactional email client. Lazy-initialized so dev environments
// without RESEND_API_KEY don't crash on import — sender functions just log
// and return false when the key is missing.
import 'server-only';
import { Resend } from 'resend';
import { env } from '@/env';

let cached: Resend | null = null;

export function getResend(): Resend | null {
  if (cached) return cached;
  if (!env.RESEND_API_KEY) return null;
  cached = new Resend(env.RESEND_API_KEY);
  return cached;
}

export class EmailError extends Error {
  constructor(
    message: string,
    public cause?: unknown,
  ) {
    super(message);
    this.name = 'EmailError';
  }
}
