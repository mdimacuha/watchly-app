'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '@/server/auth/session';
import { UnauthorizedAppError } from '@/utils/errors';
import {
  getSelectedProviders,
  updateSelectedProviders,
  type SelectedProviders,
} from '@/services/preferences/forYouPrefs';
import { getProvidersCatalog } from '@/server/tmdb/providersCatalog';

export async function getForYouPreferencesAction(): Promise<{
  selectedProviders: SelectedProviders | null;
  /** TMDB provider catalog the picker renders against. */
  catalog: Awaited<ReturnType<typeof getProvidersCatalog>>['providers'];
}> {
  const session = await getSession();
  if (!session) throw new UnauthorizedAppError();
  const [selectedProviders, catalog] = await Promise.all([
    getSelectedProviders(session.userId),
    getProvidersCatalog().then((c) => c.providers),
  ]);
  return { selectedProviders, catalog };
}

export async function updateForYouPreferencesAction(
  next: SelectedProviders,
): Promise<SelectedProviders> {
  const session = await getSession();
  if (!session) throw new UnauthorizedAppError();
  const saved = await updateSelectedProviders(session.userId, next);
  // For You reads selectedProviders directly inside the orchestrator; a
  // revalidate forces the rows to re-filter on next view.
  revalidatePath('/for-you');
  revalidatePath('/settings');
  return saved;
}
