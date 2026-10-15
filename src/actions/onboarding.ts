'use server';

import { z } from 'zod';
import { getSession } from '@/server/auth/session';
import { UnauthorizedAppError, ValidationAppError } from '@/utils/errors';
import { addFavorite } from '@/services/favorites';
import { getUserRegion } from '@/services/preferences';
import {
  searchOnboardingTitles,
  type OnboardingTitle,
} from '@/services/onboarding/titles';

const selectionSchema = z.array(
  z.object({
    mediaType: z.enum(['movie', 'tv']),
    mediaId: z.string().min(1),
  }),
).max(50);

/**
 * Adds each chosen title as a favorite. Onboarding's title-selection step
 * piggy-backs on the favorites system rather than a dedicated seed table
 * so the For You "from your favorites" row picks the signal up
 * automatically. Failures on individual rows (e.g. a TMDB id that
 * vanished) are swallowed — partial credit is better than blocking the
 * whole onboarding finish action.
 */
export async function submitOnboardingTitlesAction(
  selections: Array<{ mediaType: 'movie' | 'tv'; mediaId: string }>,
): Promise<{ added: number }> {
  const session = await getSession();
  if (!session) throw new UnauthorizedAppError();

  const parsed = selectionSchema.safeParse(selections);
  if (!parsed.success) {
    throw new ValidationAppError('Invalid selections', parsed.error.flatten());
  }

  let added = 0;
  for (const { mediaType, mediaId } of parsed.data) {
    try {
      await addFavorite(session.userId, mediaId, mediaType);
      added++;
    } catch {
      // Already-favorited / TMDB-not-found rows are non-fatal. We don't
      // want a single bad pick to abort the user's whole onboarding.
    }
  }

  return { added };
}

/**
 * Server action backing the onboarding picker's search field. Empty
 * query returns an empty array so the client can fall back to the
 * server-rendered popular grid without re-fetching it.
 *
 * Region defaults to the caller's saved preference when present so
 * search results stay locale-appropriate even before the user picks
 * a region in the next onboarding step.
 */
export async function searchOnboardingTitlesAction(
  query: string,
): Promise<OnboardingTitle[]> {
  const session = await getSession();
  if (!session) throw new UnauthorizedAppError();

  if (typeof query !== 'string' || !query.trim()) return [];

  const region = await getUserRegion(session.userId);
  return searchOnboardingTitles(query, region);
}
