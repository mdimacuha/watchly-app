import 'server-only';

import { db } from '@/db';
import { maintenanceWindows } from '@/db/schema';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { unstable_cache } from 'next/cache';
import { logger } from '@/lib/log';

export interface MaintenanceWindow {
  id: string;
  reason: string;
  startedAt: Date;
  endedAt: Date | null;
  triggeredBy: string | null;
  createdAt: Date;
}

export const MAINTENANCE_CACHE_TAG = 'maintenance-state';
// 30 seconds is a small window: short enough that a toggle propagates
// near-instantly without an explicit cache bust, long enough that the
// hot-path read on every page nav doesn't hammer Postgres. The tag-
// based invalidation in start/end is the real "instant" path.
const MAINTENANCE_REVALIDATE_SECONDS = 30;

async function readActiveMaintenance(): Promise<MaintenanceWindow | null> {
  const [row] = await db
    .select()
    .from(maintenanceWindows)
    .where(isNull(maintenanceWindows.endedAt))
    .orderBy(desc(maintenanceWindows.startedAt))
    .limit(1);
  return (row as MaintenanceWindow | undefined) ?? null;
}

/**
 * Returns the currently-active maintenance window (the row whose
 * `endedAt IS NULL`), or null if maintenance is OFF.
 *
 * Cached via `unstable_cache` with a 30s revalidate AND a tag so the
 * service can force-invalidate on toggle (no waiting for stale-while-
 * revalidate to kick in).
 */
export const getCurrentMaintenance = unstable_cache(
  readActiveMaintenance,
  ['maintenance-state'],
  {
    revalidate: MAINTENANCE_REVALIDATE_SECONDS,
    tags: [MAINTENANCE_CACHE_TAG],
  },
);

/**
 * Toggle maintenance ON. Closes any other open window first (defensive
 * — the partial unique index would reject a second open row anyway,
 * but we'd rather log it cleanly than throw).
 *
 * Returns the new row.
 */
export async function startMaintenance(
  reason: string,
  triggeredBy: string | null = null,
): Promise<MaintenanceWindow> {
  const trimmed = reason.trim();
  if (!trimmed) throw new Error('Maintenance reason is required');

  return db.transaction(async (tx) => {
    // Close any open windows so the unique constraint stays satisfied.
    await tx
      .update(maintenanceWindows)
      .set({ endedAt: new Date() })
      .where(isNull(maintenanceWindows.endedAt));

    const [row] = await tx
      .insert(maintenanceWindows)
      .values({
        reason: trimmed,
        triggeredBy,
      })
      .returning();

    logger.warn('[maintenance] started', {
      id: row.id,
      reason: trimmed,
      triggeredBy,
    });
    return row as MaintenanceWindow;
  });
}

/**
 * Toggle maintenance OFF. Closes whichever window is open. No-op if
 * nothing is open. Returns the closed row, or null if there was none.
 */
export async function endMaintenance(
  triggeredBy: string | null = null,
): Promise<MaintenanceWindow | null> {
  const now = new Date();
  const [row] = await db
    .update(maintenanceWindows)
    .set({ endedAt: now })
    .where(isNull(maintenanceWindows.endedAt))
    .returning();

  if (row) {
    logger.warn('[maintenance] ended', {
      id: row.id,
      durationMs: now.getTime() - new Date(row.startedAt).getTime(),
      triggeredBy,
    });
  }
  return (row as MaintenanceWindow | undefined) ?? null;
}

/**
 * Recent maintenance windows (open + closed), newest first. Used by
 * the dev toggle UI to show a short audit trail. Bounded read.
 */
export async function listRecentMaintenance(
  limit = 20,
): Promise<MaintenanceWindow[]> {
  const rows = await db
    .select()
    .from(maintenanceWindows)
    .orderBy(desc(maintenanceWindows.startedAt))
    .limit(limit);
  return rows as MaintenanceWindow[];
}

// Suppress unused-import warnings for `and`/`eq` — kept available for
// future queries (e.g. "window by id" lookups) without re-importing.
void and;
void eq;
