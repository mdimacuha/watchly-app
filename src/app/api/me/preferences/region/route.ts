import { requireUser } from '@/server/auth/requireUser';
import { handleRoute } from '@/lib/api';
import { updateRegion } from '@/services/preferences';

export async function PATCH(request: Request) {
  return handleRoute(async () => {
    const userId = await requireUser();
    const body = await request.json();
    return updateRegion(userId, body);
  });
}
