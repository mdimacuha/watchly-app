import type { Metadata } from 'next';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cn } from '@/lib/cn';
import { anton } from '@/lib/fonts';
import { PATHS } from '@/lib/app';
import { getAllCountries } from '@/lib/regions/countries';
import { requireUser } from '@/server/auth/requireUser';
import { getOnboardingState, getServiceChoices } from '@/services/onboarding';
import { FirstNight } from '@/components/onboarding/FirstNight';

export const metadata: Metadata = {
  title: 'Your first night',
  robots: { index: false, follow: false },
};

const COUNTRY = /^[A-Z]{2}$/;

// The first run's signed-in half: venue, screens, name on the stub, and
// tonight's ticket. Opens at the first entry not answered yet.
export default async function OnboardingPage() {
  const userId = await requireUser();
  const state = await getOnboardingState(userId);
  if (!state || state.completed) redirect(PATHS.ME);

  // Vercel tells us the visitor's country; locally there's no header and
  // the venue step says "Suggested" instead of "From your connection".
  const fromHost = (await headers()).get('x-vercel-ip-country');
  const detectedRegion = fromHost && COUNTRY.test(fromHost) ? fromHost : null;
  const cookieRegion = (await cookies()).get('watchly_region')?.value;
  const fallbackRegion = cookieRegion && COUNTRY.test(cookieRegion) ? cookieRegion : 'US';
  const region = state.regionCode ?? detectedRegion ?? fallbackRegion;

  const services = await getServiceChoices(region);
  const countries = getAllCountries().map((c) => ({ code: c.code, name: c.name }));

  return (
    <div className={cn(anton.variable, 'min-h-dvh bg-background text-foreground')}>
      <FirstNight init={{ mode: 'member', state, detectedRegion, fallbackRegion }} tasteRow={state.picks} services={services} countries={countries} />
    </div>
  );
}
