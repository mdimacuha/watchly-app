import { requireUser } from '@/server/auth/requireUser';
import { handleRoute } from '@/lib/api';
import { updateProfile } from '@/services/profile';

export async function PATCH(request: Request) {
  return handleRoute(async () => {
    const userId = await requireUser();
    const body = await request.json();
    return updateProfile(userId, body);
  });
}
