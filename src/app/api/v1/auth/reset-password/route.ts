import { handleRoute } from '@/lib/api';
import { resetPassword } from '@/services/auth/resetPassword';
import { limiters } from '@/server/ratelimit';
import { tooManyResponse } from '@/server/ratelimit/response';
import { getClientIp } from '@/server/net/clientIp';

export async function POST(request: Request) {
  const rl = limiters.resetPasswordByIp.limit(getClientIp(request));
  if (!rl.success) return tooManyResponse(rl.retryAfter);

  return handleRoute(async () => {
    const body = await request.json();
    await resetPassword(body);
    return { reset: true };
  });
}
