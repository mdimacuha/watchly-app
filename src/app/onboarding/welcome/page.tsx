import { redirect } from 'next/navigation';
import { PATHS } from '@/lib/app';

// The old step-by-step URLs. The first run is one sheet now; it opens at
// the first entry not answered yet.
export default function LegacyOnboardingStep() {
  redirect(PATHS.ONBOARDING.ROOT);
}
