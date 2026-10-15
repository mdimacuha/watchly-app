import React from 'react';
import { requireUser } from '@/server/auth/requireUser';
import { OnboardingShell } from '@/components/onboarding/OnboardingShell';
import { RegionManualSelect } from '@/components/onboarding/RegionManualSelect';
import { db } from '@/db';
import { userPreferences } from '@/db/schema';
import { eq } from 'drizzle-orm';

export default async function RegionManualPage() {
  const userId = await requireUser();

  const prefs = await db.query.userPreferences.findFirst({
    where: eq(userPreferences.userId, userId),
  });

  return (
    <OnboardingShell
      step={3}
      title="Select your region"
      description="Streaming availability varies by location. Pick your primary region to see accurate catalogs."
    >
      <RegionManualSelect initialRegionCode={prefs?.regionCode || 'US'} />
    </OnboardingShell>
  );
}
