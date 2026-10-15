import Link from 'next/link';
import { ArrowLeft, Wrench, CircleDot, CheckCircle2 } from 'lucide-react';
import {
  getCurrentMaintenance,
  listRecentMaintenance,
} from '@/services/maintenance';
import { MaintenanceToggleClient } from '@/components/maintenance/MaintenanceToggleClient';

// Dev-only — gated by middleware (`devOnlyRoutes` in src/lib/routes.ts).
// The maintenance screen ALWAYS lets /debug/* through, so this page is
// the escape hatch for flipping maintenance back off after toggling on.

export default async function MaintenanceDebugPage() {
  const [active, recent] = await Promise.all([
    getCurrentMaintenance(),
    listRecentMaintenance(10),
  ]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="container mx-auto max-w-2xl px-6 py-12 flex flex-col gap-6">
        <Link
          href="/debug"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to debug
        </Link>

        <div className="flex items-center gap-3">
          <Wrench className="text-primary" size={22} />
          <h1 className="text-h2">Maintenance mode</h1>
        </div>

        {/* Current state card */}
        <div className="rounded-xl border border-border bg-card p-5 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            {active ? (
              <>
                <CircleDot className="w-4 h-4 text-yellow-500 animate-pulse" />
                <span className="text-sm font-semibold text-yellow-300">
                  Active
                </span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span className="text-sm font-semibold text-emerald-400">
                  Disabled
                </span>
              </>
            )}
          </div>
          {active && (
            <>
              <p className="text-sm text-muted-foreground">
                Reason: <span className="text-foreground">{active.reason}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                Started{' '}
                {new Date(active.startedAt).toLocaleString(undefined, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
              </p>
            </>
          )}

          <MaintenanceToggleClient active={!!active} />
        </div>

        {/* Audit log */}
        <h2 className="text-h3 mt-2">Recent windows</h2>
        {recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No maintenance has been toggled yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {recent.map((w) => (
              <li
                key={w.id}
                className="rounded-lg border border-border p-3 text-sm flex flex-col gap-1"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium text-foreground">
                    {w.reason}
                  </span>
                  <span
                    className={
                      w.endedAt === null
                        ? 'text-[11px] text-yellow-300 font-semibold uppercase tracking-wider'
                        : 'text-[11px] text-muted-foreground uppercase tracking-wider'
                    }
                  >
                    {w.endedAt === null ? 'open' : 'closed'}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {new Date(w.startedAt).toLocaleString()} →{' '}
                  {w.endedAt
                    ? new Date(w.endedAt).toLocaleString()
                    : 'now'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
