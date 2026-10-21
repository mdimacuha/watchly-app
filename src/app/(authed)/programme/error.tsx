"use client";

import { ErrorState } from "@/components/watchly/ErrorState";
import { Button } from "@/components/ui/button";

export default function ForYouError({ reset }: { reset: () => void }) {
  return (
    <div className="px-6 py-16 flex items-center justify-center">
      <ErrorState
        title="Couldn't load your briefing"
        description="Something went wrong while building Tonight's Programme. Please try again."
        action={<Button onClick={reset}>Try again</Button>}
      />
    </div>
  );
}
