'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { MaintenanceScreen } from './MaintenanceScreen';

interface MaintenanceStatus {
  active: boolean;
  reason: string | null;
  startedAt: string | null;
}

/**
 * Client-side maintenance gate. Replaces the former server-rendered gate in the
 * root layout, which called `await headers()` + `getCurrentMaintenance()` and
 * thereby forced EVERY page (including the public, crawlable title/tv/artist/
 * collection pages) into per-request dynamic rendering — the root cause of the
 * 0%-cache / high Active-CPU incident.
 *
 * Maintenance is purely presentational (route handlers run as-is during a
 * window — see services/maintenance), so gating it on the client is
 * behaviourally equivalent while keeping the tree statically renderable.
 *
 * Renders children immediately (the common, not-in-maintenance case) and only
 * overlays the maintenance screen once the cached /api/maintenance flag comes
 * back active. `/debug` stays reachable so an operator can toggle maintenance
 * back off from /debug/maintenance even while it's on.
 */
export function MaintenanceGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [status, setStatus] = useState<MaintenanceStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/maintenance')
      .then((r) => (r.ok ? r.json() : null))
      .then((json: MaintenanceStatus | null) => {
        if (!cancelled) setStatus(json);
      })
      .catch(() => {
        // Best-effort: if the flag can't be read, fail open (show the app).
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const isDebug = pathname?.startsWith('/debug') ?? false;

  if (status?.active && status.startedAt && !isDebug) {
    return (
      <MaintenanceScreen
        reason={status.reason ?? ''}
        startedAt={new Date(status.startedAt)}
      />
    );
  }

  return <>{children}</>;
}
