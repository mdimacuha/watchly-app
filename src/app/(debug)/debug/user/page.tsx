import { cookies } from 'next/headers';
import { db } from '@/db';
import { userPreferences, userProfiles, users, userSessions } from '@/db/schema';
import { eq } from 'drizzle-orm';

async function DebugUserDetailsPage() {
  const getCookieSession = async () => {
    const cookieStore = await cookies();
    return cookieStore.get('watchly_session');
  };

  const getDecodedSession = async () => {
    const cookieSession = await getCookieSession();
    if (!cookieSession?.value) return null;

    const session = await db.query.userSessions.findFirst({
      where: eq(userSessions.sessionToken, cookieSession.value),
    });

    if (!session) return null;

    return { session };
  };

  const decodedSession = await getDecodedSession();

  if (!decodedSession?.session?.userId) return null;

  const userDetails = await db.query.users.findFirst({
    where: eq(users.id, decodedSession?.session?.userId),
  });

  const userProfileDetails = await db.query.userProfiles.findFirst({
    where: eq(userProfiles.userId, decodedSession?.session?.userId),
  });

  const userPreferencesDetails = await db.query.userPreferences.findFirst({
    where: eq(userPreferences.userId, decodedSession?.session?.userId),
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="container mx-auto max-w-5xl px-6 py-16 space-y-20">
        <h1 className="text-h1">Debug Auth</h1>
        <div className="bg-card p-4 rounded-lg">
          <h2 className="text-h2 mb-2 border-b border-border pb-2">
            Cookie Session
          </h2>
          <pre className="text-sm text-muted-foreground">
            {JSON.stringify(await getCookieSession(), null, 2)}
          </pre>
        </div>

        <div className="bg-card p-4 rounded-lg">
          <h2 className="text-h2 mb-2 border-b border-border pb-2">
            Decoded Session
          </h2>
          <pre className="text-sm text-muted-foreground text-wrap">
            {decodedSession
              ? JSON.stringify(decodedSession, null, 2)
              : 'No active session found'}
          </pre>
        </div>

        <div className="bg-card p-4 rounded-lg">
          <h2 className="text-h2 mb-2 border-b border-border pb-2">
            User Details
          </h2>
          <pre className="text-sm text-muted-foreground text-wrap">
            {userDetails
              ? JSON.stringify(userDetails, null, 2)
              : 'No user details found'}
          </pre>
        </div>

        <div className="bg-card p-4 rounded-lg">
          <h2 className="text-h2 mb-2 border-b border-border pb-2">
            User Profile Details
          </h2>
          <pre className="text-sm text-muted-foreground text-wrap">
            {userProfileDetails
              ? JSON.stringify(userProfileDetails, null, 2)
              : 'No user profile details found'}
          </pre>
        </div>

        <div className="bg-card p-4 rounded-lg">
          <h2 className="text-h2 mb-2 border-b border-border pb-2">
            User Preferences Details
          </h2>
          <pre className="text-sm text-muted-foreground text-wrap">
            {userPreferencesDetails
              ? JSON.stringify(userPreferencesDetails, null, 2)
              : 'No user preferences details found'}
          </pre>
        </div>
      </div>
    </div>
  );
}

export default DebugUserDetailsPage;
