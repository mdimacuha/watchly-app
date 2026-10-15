import React from 'react';
import { requireUser } from '@/server/auth/requireUser';
import { OnboardingShell } from '@/components/onboarding/OnboardingShell';
import { TitlesPicker } from '@/components/onboarding/TitlesPicker';
import { BackLink } from '@/components/nav/BackLink';
import { PATHS } from '@/lib/app';
import { getUserRegion } from '@/services/preferences';
import { getOnboardingPicks } from '@/services/onboarding/titles';

export default async function TitlesPage() {
  const userId = await requireUser();
  const region = await getUserRegion(userId);
  const titles = await getOnboardingPicks(region);

  return (
    <OnboardingShell
      step={4}
      title="Choose your favorites"
      description="Tap titles you’ve loved. We’ll use them to seed your For You feed."
      footer={
        <BackLink
          fallbackHref={PATHS.ONBOARDING.REGION_MANUAL}
          label="Back to Region"
        />
      }
    >
      <TitlesPicker titles={titles} />
    </OnboardingShell>
  );
}
