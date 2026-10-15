import { signOut } from '@/services/auth/signout';
import { handleRoute } from '@/lib/api';
import { clearSessionCookie, clearThemeCookie } from '@/utils/server/cookies';

export async function POST() {
  return handleRoute(async () => {
    await signOut();
    await clearSessionCookie();
    // Clear the theme cookie too so the next signin (possibly a different
    // user on a shared device) doesn't inherit the previous user's theme
    // on first paint before localStorage takes over.
    await clearThemeCookie();

    return { message: 'Signed out successfully' };
  });
}
