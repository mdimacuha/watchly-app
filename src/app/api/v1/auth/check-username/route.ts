import { z } from 'zod';
import { handleRoute } from '@/lib/api';
import { ValidationAppError } from '@/utils/errors';
import { validateUsername } from '@/services/moderation/validateUsername';
import { isUsernameExisting } from '@/services/users/helper';
import { limiters } from '@/server/ratelimit';
import { tooManyResponse } from '@/server/ratelimit/response';
import { getClientIp } from '@/server/net/clientIp';

/**
 * POST /api/v1/auth/check-username
 *
 * Lets the signup form ask "is this username available?" while the
 * user is typing — same validation pipeline as the real signup so
 * the answer is authoritative.
 *
 * Returns 200 with `{ available, message? }` regardless of pass/fail,
 * because the form needs to render the result either way. 4xx is
 * reserved for malformed bodies and rate-limit overflow.
 */

const bodySchema = z.object({
  username: z.string().min(1).max(64),
});

export async function POST(request: Request) {
  // Rate-limit BEFORE auth checks (this endpoint is unauthenticated —
  // a typing user has no session yet). Tight bucket since each hit
  // is one indexed lookup.
  const rl = limiters.authCheckUsername.limit(getClientIp(request));
  if (!rl.success) return tooManyResponse(rl.retryAfter);

  return handleRoute(async () => {
    const body = await request.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationAppError(
        'Invalid request',
        parsed.error.flatten(),
      );
    }

    // Run the SAME validateUsername the signup service uses so the
    // user can't get a green check here then fail at submit.
    const validation = validateUsername(parsed.data.username);
    if (!validation.valid) {
      return {
        available: false,
        message: validation.message ?? 'This username is not allowed.',
      };
    }

    const taken = await isUsernameExisting(validation.normalizedUsername!);
    if (taken) {
      return {
        available: false,
        message: 'This username is already taken.',
      };
    }

    return { available: true };
  });
}
