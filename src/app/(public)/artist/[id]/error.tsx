"use client";

import { ErrorState } from "@/components/watchly/ErrorState";
import { Button } from "@/components/ui/button";

export default function ArtistError({ reset }: { reset: () => void }) {
  return (
    <div className="px-6 py-16 flex items-center justify-center">
      <ErrorState
        title="Couldn't load this artist"
        description="Something went wrong while fetching the profile. Please try again."
        action={<Button onClick={reset}>Try again</Button>}
      />
    </div>
  );
}
