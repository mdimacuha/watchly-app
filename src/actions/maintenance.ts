'use server';

import { revalidatePath, updateTag } from 'next/cache';
import { getSession } from '@/server/auth/session';
import {
  startMaintenance,
  endMaintenance,
  MAINTENANCE_CACHE_TAG,
  type MaintenanceWindow,
} from '@/services/maintenance';

/**
 * Toggle maintenance ON. Reason is required (it surfaces on the
 * maintenance screen). Returns the new row.
 *
 * Caller doesn't have to be signed in — but if they are we record
 * their userId in `triggered_by` for the audit trail. The /debug
 * page that wraps this is dev-only-gated by middleware.
 */
export async function startMaintenanceAction(
  reason: string,
): Promise<MaintenanceWindow> {
  const session = await getSession();
  const row = await startMaintenance(reason, session?.userId ?? null);
  // Bust the cached read so the next page paint sees the new state.
  updateTag(MAINTENANCE_CACHE_TAG);
  revalidatePath('/', 'layout');
  return row;
}

export async function endMaintenanceAction(): Promise<MaintenanceWindow | null> {
  const session = await getSession();
  const row = await endMaintenance(session?.userId ?? null);
  updateTag(MAINTENANCE_CACHE_TAG);
  revalidatePath('/', 'layout');
  return row;
}
