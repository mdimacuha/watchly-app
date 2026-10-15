import React from 'react';
import { requireUser } from '@/server/auth/requireUser';
import { OnboardingShell } from '@/components/onboarding/OnboardingShell';
import { ProfileForm } from '@/components/onboarding/ProfileForm';
import { db } from '@/db';
import { userProfiles, users } from '@/db/schema';
import { eq } from 'drizzle-orm';

export default async function ProfilePage() {
  const userId = await requireUser();

  // Fetch existing profile and user data
  const profile = await db.query.userProfiles.findFirst({
    where: eq(userProfiles.userId, userId),
  });
  
  // Also fetch user to get username if profile display name is empty (shouldn't be based on signup, but safe to check)
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  const initialDisplayName = profile?.displayName || user?.username || '';

  return (
    <OnboardingShell
      step={2}
      title="Set up your profile"
      description="Add a photo and tell us a bit about yourself."
    >
      <ProfileForm
        initialDisplayName={initialDisplayName}
        initialBio={profile?.bio ?? ''}
        initialAvatarUrl={profile?.avatarUrl ?? ''}
        firstName={user?.firstName ?? ''}
        lastName={user?.lastName ?? ''}
      />
    </OnboardingShell>
  );
}
