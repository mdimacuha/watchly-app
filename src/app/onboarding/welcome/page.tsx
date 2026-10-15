import React from 'react';
import { requireUser } from '@/server/auth/requireUser';
import { OnboardingShell } from '@/components/onboarding/OnboardingShell';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { PATHS } from '@/lib/app';
import { Clock } from 'lucide-react';

export default async function WelcomePage() {
  await requireUser();

  return (
    <OnboardingShell
      step={1}
      title="Let's personalize Watchly"
      description="We'll help you find where to watch your favorite movies and shows in your region."
      className="text-center"
    >
      <div className="flex flex-col items-center gap-6 py-2">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-secondary/50 text-xs font-medium text-muted-foreground border border-border/50">
          <Clock size={12} />
          <span>~30 seconds setup</span>
        </div>

        <Button asChild size="lg" className="w-full sm:w-auto min-w-[200px] h-11 text-base font-medium">
          <Link href={PATHS.ONBOARDING.PROFILE}>
            Start Setup
          </Link>
        </Button>

        {/* Plain anchor (not Link) so skipping triggers a full reload —
            same UX as Finish on the titles step. The (authed) layout
            then picks up the user's accent / theme cookie from scratch. */}
        <Button asChild variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
          <a href="/me">
            Skip for now
          </a>
        </Button>
      </div>
    </OnboardingShell>
  );
}
