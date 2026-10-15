import { handleRoute } from '@/lib/api';
import { getSession } from '@/server/auth/session';
import { UnauthorizedAppError, ValidationAppError } from '@/utils/errors';
import {
  sendVerificationEmail,
  CooldownError,
} from '@/services/auth/emailFlows';
import { limiters } from '@/server/ratelimit';
import { tooManyResponse } from '@/server/ratelimit/response';
import { getClientIp } from '@/server/net/clientIp';

export async function POST(request: Request) {
  const rl = limiters.verifyEmailResendByIp.limit(getClientIp(request));
  if (!rl.success) return tooManyResponse(rl.retryAfter);

  return handleRoute(async () => {
    const session = await getSession();
    if (!session) throw new UnauthorizedAppError();

    try {
      await sendVerificationEmail(session.userId, { respectCooldown: true });
    } catch (err) {
      if (err instanceof CooldownError) {
        // Map to a generic 400; the wait time goes into the body so the
        // client can render "Try again in N seconds" without parsing copy.
        throw new ValidationAppError(
          `Please wait ${err.retryAfterSeconds} seconds before resending.`,
          { retryAfterSeconds: err.retryAfterSeconds },
        );
      }
      throw err;
    }

    return { sent: true };
  });
}
