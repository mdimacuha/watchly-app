import { handleRoute } from '@/lib/api';
import { consumeEmailVerification } from '@/services/auth/verifyEmail';
import { ValidationAppError } from '@/utils/errors';
import { limiters } from '@/server/ratelimit';
import { tooManyResponse } from '@/server/ratelimit/response';
import { getClientIp } from '@/server/net/clientIp';

export async function POST(request: Request) {
  const rl = limiters.verifyEmailByIp.limit(getClientIp(request));
  if (!rl.success) return tooManyResponse(rl.retryAfter);

  return handleRoute(async () => {
    const body = (await request.json()) as { token?: unknown };
    if (typeof body.token !== 'string' || !body.token) {
      throw new ValidationAppError('Token is required');
    }
    await consumeEmailVerification(body.token);
    return { verified: true };
  });
}
