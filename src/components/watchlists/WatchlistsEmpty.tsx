import React from 'react';

/** Shared empty state: a dashed cover slot that opens the create modal. */
export function WatchlistsEmpty({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border px-6 py-16 text-center">
      <p className="text-base font-semibold text-foreground">No watchlists yet</p>
      <p className="max-w-sm text-sm text-muted-foreground">
        Make one for tonight, the weekend, or that show everyone keeps mentioning.
      </p>
      <button
        onClick={onCreate}
        className="mt-2 text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
      >
        Create your first list
      </button>
    </div>
  );
}
