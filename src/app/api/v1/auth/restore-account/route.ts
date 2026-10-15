import { handleRoute } from '@/lib/api';
import { restoreAccount } from '@/services/auth/restoreAccount';
import { ValidationAppError } from '@/utils/errors';
import { limiters } from '@/server/ratelimit';
import { tooManyResponse } from '@/server/ratelimit/response';
import { getClientIp } from '@/server/net/clientIp';

export async function POST(request: Request) {
  const rl = limiters.restoreAccountByIp.limit(getClientIp(request));
  if (!rl.success) return tooManyResponse(rl.retryAfter);

  return handleRoute(async () => {
    const body = (await request.json()) as { token?: unknown };
    if (typeof body.token !== 'string' || !body.token) {
      throw new ValidationAppError('Token is required');
    }
    await restoreAccount(body.token);
    return { restored: true };
  });
}
