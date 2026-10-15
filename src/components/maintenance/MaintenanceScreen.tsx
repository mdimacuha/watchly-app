import Image from 'next/image';
import { Wrench } from 'lucide-react';
import { RefreshButton } from './RefreshButton';

interface MaintenanceScreenProps {
  /** Operator-facing copy from the active maintenance window. */
  reason: string;
  startedAt: Date;
}

/**
 * Full-page screen rendered when maintenance is on. Lives at the root
 * layout level so every authed + public surface gets it for free.
 * Keeps the brand visible at the top so users know they're still on
 * Watchly, just temporarily down.
 *
 * Server component — the only interactive bit is a Refresh button
 * which is its own thin client component.
 */
export function MaintenanceScreen({ reason, startedAt }: MaintenanceScreenProps) {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Top bar — brand only, no nav. */}
      <header className="h-16 flex items-center justify-center border-b border-border/40 shrink-0">
        <Image
          src="/brand-light.svg"
          alt="Watchly"
          width={32}
          height={32}
          priority
          className="w-auto h-auto"
        />
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md flex flex-col items-center text-center gap-5">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center text-primary">
            <Wrench className="w-7 h-7" />
          </div>

          <h1 className="text-h2">Maintenance in progress</h1>

          <p className="text-sm text-muted-foreground leading-relaxed">
            {reason}
          </p>

          <p className="text-sm text-foreground/85">
            Please check a bit later or refresh the app.
          </p>

          <RefreshButton />

          <p className="text-xs text-muted-foreground mt-2">
            Started {formatStartedAt(startedAt)}
          </p>
        </div>
      </main>
    </div>
  );
}

function formatStartedAt(d: Date): string {
  // Hardcoded en-US for the SSR'd timestamp (the user-locale-aware
  // version would re-render on the client). Operator-facing copy
  // anyway.
  return new Date(d).toLocaleString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    day: 'numeric',
  });
}
