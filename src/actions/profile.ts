'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '@/server/auth/session';
import { UnauthorizedAppError } from '@/utils/errors';
import {
  updateProfile,
  getProfileWithStats,
  getMyProfileOverview,
  getPublicProfileOverview,
} from '@/services/profile';
import { invalidateAccentColorFor } from '@/services/profile/accentCache';
import type { UpdateProfileInput } from '@/services/profile/validators';

export async function updateProfileAction(input: UpdateProfileInput) {
  const session = await getSession();
  if (!session) throw new UnauthorizedAppError();
  const updated = await updateProfile(session.userId, input);
  // accent_color sits behind a per-user unstable_cache tag so the layout
  // doesn't refetch it on every nav. Bust the tag when the user edits.
  invalidateAccentColorFor(session.userId);
  revalidatePath('/me');
  return updated;
}

export async function getMyProfileAction() {
  const session = await getSession();
  if (!session) throw new UnauthorizedAppError();
  return getProfileWithStats(session.userId);
}

export async function getMyProfileOverviewAction() {
  const session = await getSession();
  if (!session) throw new UnauthorizedAppError();
  return getMyProfileOverview(session.userId);
}

export async function getPublicProfileAction(username: string) {
  const session = await getSession();
  const viewerId = session?.userId ?? null;
  return getPublicProfileOverview(username, viewerId);
}

/**
 * PROTOTYPE data for the profile redesign: the privacy-safe public overview
 * plus personality insights and (for visitors) a taste match. `asGuest`
 * loads the profile exactly as a signed-out visitor sees it — the owner's
 * "Preview as visitor" goes through the real privacy path, not a mock.
 */
export async function getProfileShowcaseAction(
  username: string,
  opts: { asGuest?: boolean } = {},
) {
  const session = await getSession();
  const viewerId = opts.asGuest ? null : (session?.userId ?? null);
  const { getPublicProfileOverview, getTasteProfile } = await import('@/services/profile');
  const { getProfileInsights, getTasteMatch, loadTitle } = await import('@/services/profile/insights');
  const { getWatchedEntries } = await import('@/services/watched');
  const { getFavorites } = await import('@/services/favorites');

  const overview = await getPublicProfileOverview(username, viewerId);
  const ownerId = overview.profile.userId;
  const canSeeWatched = !overview.watchedHidden;
  const canSeeFavorites = !overview.favoritesHidden;

  const ownerWatched = canSeeWatched ? await getWatchedEntries(ownerId) : [];
  const insights = await getProfileInsights(
    ownerId,
    { favorites: canSeeFavorites, watched: canSeeWatched, privateLists: overview.isSelf, swipes: overview.isSelf },
    ownerWatched,
  );

  let match = null;
  if (viewerId && !overview.isSelf) {
    const [viewerFavs, viewerWatched, viewerTaste, ownerFavs] = await Promise.all([
      getFavorites(viewerId, { limit: 200 }),
      getWatchedEntries(viewerId),
      getTasteProfile(viewerId),
      canSeeFavorites ? getFavorites(ownerId, { limit: 200 }) : Promise.resolve([]),
    ]);
    const viewerKeys = new Set([
      ...viewerFavs.map((f) => `${f.favoriteType}:${f.favoriteId}`),
      ...viewerWatched.map((w) => `${w.mediaType}:${w.mediaId}`),
    ]);
    const ownerKeys = [
      ...ownerFavs
        .filter((f) => f.favoriteType === 'movie' || f.favoriteType === 'tv')
        .map((f) => `${f.favoriteType}:${f.favoriteId}`),
      ...ownerWatched.map((w) => `${w.mediaType}:${w.mediaId}`),
    ];
    match = await getTasteMatch(
      { keys: viewerKeys, genres: viewerTaste.genres },
      { keys: [...new Set(ownerKeys)], genres: overview.tasteProfile.genres },
    );
  }

  // Card highlight: the custom pick resolved to a title (shown to everyone —
  // the owner chose to feature it).
  const cf = overview.profile.cardFeature;
  const cardFeatureTitle =
    cf.mode === 'custom' && cf.mediaType && cf.mediaId ? await loadTitle(cf.mediaType, cf.mediaId) : null;

  // Owner only: "People you might know" (not shown to visitors / preview).
  const followSuggestions = overview.isSelf
    ? await import('@/services/social').then((m) => m.getFollowSuggestions(ownerId, { limit: 10 }))
    : [];

  // Owner only: favorites to choose a custom highlight from (editor picker).
  const pickerFavorites = overview.isSelf
    ? (
        await Promise.all(
          (await getFavorites(ownerId, { limit: 40 }))
            .filter((f) => f.favoriteType === 'movie' || f.favoriteType === 'tv')
            .map((f) => loadTitle(f.favoriteType, f.favoriteId)),
        )
      ).filter((t): t is NonNullable<typeof t> => t !== null)
    : [];

  return {
    overview,
    insights,
    match,
    viewerSignedIn: !!session,
    cardFeatureTitle,
    pickerFavorites,
    followSuggestions,
  };
}

export type ProfileShowcase = Awaited<ReturnType<typeof getProfileShowcaseAction>>;
