import { handleRoute } from '@/lib/api';
import { sendPasswordResetEmail } from '@/services/auth/emailFlows';
import { ValidationAppError } from '@/utils/errors';
import { z } from 'zod';
import { limiters, applyLimits } from '@/server/ratelimit';
import { tooManyResponse } from '@/server/ratelimit/response';
import { getClientIp } from '@/server/net/clientIp';

const schema = z.object({ email: z.string().email() });

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = schema.safeParse(body);

  // Composite limit: a single IP is capped at 5 / 15min AND any one
  // email address is capped at 2 / 15min — so a botnet hammering the
  // same target email from many IPs still trips the email bucket,
  // and a single attacker spraying many addresses still trips the IP
  // bucket. Both checks run on the same request so the limiter sees
  // every actual send attempt.
  const email = parsed.success ? parsed.data.email.toLowerCase() : null;
  const ip = getClientIp(request);
  const rl = applyLimits([
    { limiter: limiters.forgotPasswordByIp, key: `ip:${ip}` },
    ...(email
      ? [{ limiter: limiters.forgotPasswordByEmail, key: `email:${email}` }]
      : []),
  ]);
  if (!rl.success) return tooManyResponse(rl.retryAfter);

  return handleRoute(async () => {
    if (!parsed.success) {
      throw new ValidationAppError('Invalid email');
    }

    // Always succeeds publicly — even if the email isn't registered. The
    // sender function silently no-ops in that case so we can't be used to
    // enumerate registered emails.
    await sendPasswordResetEmail(parsed.data.email);
    return { sent: true };
  });
}
