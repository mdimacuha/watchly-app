import { handleRoute } from '@/lib/api';
import { isCronRequest } from '@/server/cron/auth';
import { UnauthorizedAppError } from '@/utils/errors';
import { runTitleAlertCheck } from '@/services/alerts';

// Daily "Notify me when" check, scheduled in vercel.json.
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: Request) {
  return handleRoute(async () => {
    if (!isCronRequest(request)) throw new UnauthorizedAppError('Unauthorized');
    return runTitleAlertCheck();
  });
}
