import { z } from 'zod';

// We don't need to manually load env config with @next/env in Next.js 13+ / App Router
// Next.js automatically loads .env files.
// The previous manual loading was likely causing the Edge Runtime issue because @next/env relies on Node.js APIs.

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_ENV: z.string().min(1).default('development'),
  UPLOADTHING_TOKEN: z.string().min(1),
  // Email transport. Production uses Resend (set RESEND_API_KEY); dev
  // without a Resend key automatically falls through to a local SMTP
  // trapper (MailHog / Mailpit by default at 1025) so signup + reset +
  // restore flows are testable end-to-end without sending real email.
  // EMAIL_FROM defaults to the team dev sender so unconfigured dev
  // environments still produce a sensible From header.
  RESEND_API_KEY: z.string().min(1).optional(),
  EMAIL_FROM: z.string().min(1).default('watchly-noreply@dayonelabs.co'),
  PUBLIC_APP_URL: z.string().url().optional(),
  // Dev SMTP trapper (MailHog / Mailpit). In dev we ALWAYS route here
  // (Resend is bypassed in non-prod) so test signups can't accidentally
  // hit real inboxes. Defaults match MailHog's `-smtp-bind-addr` of
  // 0.0.0.0:1025 — port 8025 is the web UI, NOT the SMTP listener.
  SMTP_HOST: z.string().min(1).default('localhost'),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  // Shared secret Vercel Cron sends as `Authorization: Bearer <secret>`.
  // Unset = cron routes refuse every call.
  CRON_SECRET: z.string().min(16).optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error(
    'Invalid environment variables:',
    parsed.error.flatten().fieldErrors
  );
  // Throw error instead of process.exit(1) to be compatible with Edge Runtime
  throw new Error('Invalid environment variables');
}

export const env = parsed.data;
