import { signUp } from '@/services/auth/signup';
import { handleRoute } from '@/lib/api';

export async function POST(request: Request) {
  return handleRoute(async () => {
    const body = await request.json();
    return signUp(body);
  });
}
