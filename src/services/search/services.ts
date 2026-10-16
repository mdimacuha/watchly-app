import 'server-only';

import { z } from 'zod';
import { getProvidersCatalog } from '@/server/tmdb/providersCatalog';
import { ValidationAppError } from '@/utils/errors';

export interface SearchService {
  /** TMDB provider id (global; availability is per region). */
  id: number;
  name: string;
  logoPath: string | null;
  /** One of the big, widely-used services — pinned to the top of the list. */
  featured: boolean;
}

// Pinned services, in display order. Matched by name because ids vary by
// region (e.g. Prime Video is 9 in the US, 119 elsewhere; HBO's service is
// "Max" in some regions, "HBO GO" in others).
const FEATURED: RegExp[] = [
  /^netflix$/i,
  /^(amazon )?prime video$/i,
  /^disney\s?(\+|plus)$/i,
  /^hulu$/i,
  /^(hbo )?max$|^hbo( go)?$/i,
  /^apple tv(\+| plus)?$/i,
];

// Resale/add-on listings that would bury real services ("Shudder Amazon
// Channel", "Paramount+ Roku Premium Channel", "Netflix basic with Ads").
const NOISE = /channel|with ads|\bbasic\b/i;

const regionSchema = z.object({ region: z.string().length(2).optional() });

/**
 * Streaming services for the search filter in a region: the popular ones
 * first (when available there), then every other service by TMDB's display
 * priority. Backed by the provider catalog (cached 24h per region).
 */
export async function getSearchServices(rawQuery: unknown): Promise<SearchService[]> {
  const parsed = regionSchema.safeParse(rawQuery);
  if (!parsed.success) {
    throw new ValidationAppError('Invalid region', parsed.error.flatten());
  }
  const region = (parsed.data.region ?? 'US').toUpperCase();
  const { providers } = await getProvidersCatalog(region);

  const usable = providers.filter((p) => !NOISE.test(p.provider_name));
  const featuredIds = new Set<number>();
  const featured: SearchService[] = [];
  for (const pattern of FEATURED) {
    const match = usable.find((p) => pattern.test(p.provider_name) && !featuredIds.has(p.provider_id));
    if (!match) continue;
    featuredIds.add(match.provider_id);
    featured.push({ id: match.provider_id, name: match.provider_name, logoPath: match.logo_path, featured: true });
  }

  const rest = usable
    .filter((p) => !featuredIds.has(p.provider_id))
    .map((p) => ({ id: p.provider_id, name: p.provider_name, logoPath: p.logo_path, featured: false }));

  return [...featured, ...rest];
}
