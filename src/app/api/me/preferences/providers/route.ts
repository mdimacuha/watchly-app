import { requireUser } from '@/server/auth/requireUser';
import { handleRoute } from '@/lib/api';
import { updateSelectedProviders } from '@/services/preferences/forYouPrefs';

/** The streaming services a person has (For You scopes to them; [] = any). */
export async function PATCH(request: Request) {
  return handleRoute(async () => {
    const userId = await requireUser();
    const body = (await request.json().catch(() => null)) as { providers?: unknown } | null;
    return { providers: await updateSelectedProviders(userId, body?.providers as number[]) };
  });
}
