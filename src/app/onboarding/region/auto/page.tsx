import React from 'react';
import { requireUser } from '@/server/auth/requireUser';
import { OnboardingShell } from '@/components/onboarding/OnboardingShell';
import { RegionAutoDetect } from '@/components/onboarding/RegionAutoDetect';

export default async function RegionAutoPage() {
  await requireUser();

  return (
    <OnboardingShell
      step={3}
      title="Where are you located?"
      description="To show you where to watch movies and shows, we need to know your region."
    >
      <RegionAutoDetect />
    </OnboardingShell>
  );
}
