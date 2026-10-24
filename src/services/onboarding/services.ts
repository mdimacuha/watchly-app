import 'server-only';

import { getProvidersCatalog } from '@/server/tmdb/providersCatalog';
import { buildImageUrl } from '@/lib/tmdb';
import { ValidationAppError } from '@/utils/errors';

export interface ServiceChoice {
  id: number;
  name: string;
  logo: string | null;
}

// Services a cinephile looks for first; kept even when TMDB ranks them low.
const NICHE = /mubi|criterion|kanopy|shudder|curiosity|bfi|arrow|hoopla/i;
// Stores and free libraries aren't "screens you have".
const NOT_A_SUBSCRIPTION = /store|amazon video|google play|youtube|public domain|fandango|microsoft|plex/i;

/** The screens step's choices for a region: the big services, then the niche ones. */
export async function getServiceChoices(region: string): Promise<ServiceChoice[]> {
  const catalog = await getProvidersCatalog(region).catch(() => null);
  const all = (catalog?.providers ?? [])
    .filter((p) => !NOT_A_SUBSCRIPTION.test(p.provider_name))
    .sort((a, b) => (a.display_priority ?? 999) - (b.display_priority ?? 999));
  const top = all.slice(0, 15);
  const niche = all.filter((p) => NICHE.test(p.provider_name) && !top.includes(p)).slice(0, 5);
  return [...top, ...niche].map((p) => ({ id: p.provider_id, name: p.provider_name, logo: buildImageUrl(p.logo_path, 'w92') }));
}

/** The screens step's choices from a raw query param (the route's entry point). */
export async function getServiceChoicesFor(region: string | null): Promise<ServiceChoice[]> {
  if (!region || !/^[A-Z]{2}$/.test(region)) throw new ValidationAppError('Invalid region');
  return getServiceChoices(region);
}
