'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '@/server/auth/session';
import { UnauthorizedAppError } from '@/utils/errors';
import {
  updateProfile,
  getProfileWithStats,
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

/**
 * Data for the profile page: the privacy-safe public overview
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

  // Everything below depends only on the overview, so it runs concurrently
  // (insights and the taste match share the owner's watched list).
  const ownerWatchedP = canSeeWatched ? getWatchedEntries(ownerId) : Promise.resolve([]);

  const insightsP = ownerWatchedP.then((ownerWatched) =>
    getProfileInsights(
      ownerId,
      { favorites: canSeeFavorites, watched: canSeeWatched, privateLists: overview.isSelf, swipes: overview.isSelf },
      ownerWatched,
    ),
  );

  const matchP =
    viewerId && !overview.isSelf
      ? Promise.all([
          getFavorites(viewerId, { limit: 200 }),
          getWatchedEntries(viewerId),
          getTasteProfile(viewerId),
          canSeeFavorites ? getFavorites(ownerId, { limit: 200 }) : Promise.resolve([]),
          ownerWatchedP,
        ]).then(([viewerFavs, viewerWatched, viewerTaste, ownerFavs, ownerWatched]) => {
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
          return getTasteMatch(
            { keys: viewerKeys, genres: viewerTaste.genres },
            { keys: [...new Set(ownerKeys)], genres: overview.tasteProfile.genres },
          );
        })
      : Promise.resolve(null);

  // Card highlight: the custom pick resolved to a title (shown to everyone —
  // the owner chose to feature it).
  const cf = overview.profile.cardFeature;
  const cardFeatureTitleP =
    cf.mode === 'custom' && cf.mediaType && cf.mediaId ? loadTitle(cf.mediaType, cf.mediaId) : Promise.resolve(null);

  // Owner only: "People you might know" (not shown to visitors / preview).
  const followSuggestionsP = overview.isSelf
    ? import('@/services/social').then((m) => m.getFollowSuggestions(ownerId, { limit: 10 }))
    : Promise.resolve([]);

  // Owner only: favorites to choose a custom highlight from (editor picker).
  const pickerFavoritesP = overview.isSelf
    ? getFavorites(ownerId, { limit: 40 })
        .then((favs) =>
          Promise.all(
            favs
              .filter((f) => f.favoriteType === 'movie' || f.favoriteType === 'tv')
              .map((f) => loadTitle(f.favoriteType, f.favoriteId)),
          ),
        )
        .then((titles) => titles.filter((t): t is NonNullable<typeof t> => t !== null))
    : Promise.resolve([]);

  // Feature presentation picks (shown to everyone who can open the profile).
  const featuredP = import('@/services/profile/featured').then((m) => m.getFeaturedTitles(ownerId));

  const [insights, match, cardFeatureTitle, followSuggestions, pickerFavorites, featured] = await Promise.all([
    insightsP,
    matchP,
    cardFeatureTitleP,
    followSuggestionsP,
    pickerFavoritesP,
    featuredP,
  ]);

  return {
    overview,
    insights,
    match,
    viewerSignedIn: !!session,
    cardFeatureTitle,
    pickerFavorites,
    followSuggestions,
    featured,
  };
}

export type ProfileShowcase = Awaited<ReturnType<typeof getProfileShowcaseAction>>;

const PROFILE_REVIEWS_PAGE = 20;

/**
 * One page of a member's reviews (newest first) for the profile's Reviews
 * tab. Same privacy gate as the profile itself (blocked / private /
 * followers-only); `asGuest` mirrors "Preview as visitor".
 */
export async function getProfileReviewsAction(
  username: string,
  opts: { asGuest?: boolean; offset?: number } = {},
) {
  const session = await getSession();
  const viewerId = opts.asGuest ? null : (session?.userId ?? null);
  const { getPublicProfileByUsername } = await import('@/services/profile');
  const { getUserReviews } = await import('@/services/reviews');
  const profile = await getPublicProfileByUsername(username, viewerId);
  const offset = Number.isInteger(opts.offset) && opts.offset! > 0 ? opts.offset! : 0;
  // One extra row tells us whether there is a next page.
  const rows = await getUserReviews(profile.userId, { limit: PROFILE_REVIEWS_PAGE + 1, offset });
  return { items: rows.slice(0, PROFILE_REVIEWS_PAGE), hasMore: rows.length > PROFILE_REVIEWS_PAGE };
}

/**
 * The Library's favorites: "All favorites" (unless hidden) plus shelves —
 * public shelves for visitors (even when favorites are hidden), every shelf
 * for the owner. Same privacy gate as the profile; `asGuest` mirrors
 * "Preview as visitor".
 */
export async function getProfileFavoritesAction(username: string, opts: { asGuest?: boolean } = {}) {
  const session = await getSession();
  const viewerId = opts.asGuest ? null : (session?.userId ?? null);
  const { getPublicProfileByUsername } = await import('@/services/profile');
  const { getProfileFavorites } = await import('@/services/favorites/profileShelves');
  const profile = await getPublicProfileByUsername(username, viewerId);
  const { getFollowState } = await import('@/services/social');
  const role =
    viewerId === profile.userId
      ? 'owner'
      : (await getFollowState(viewerId, profile.userId)).status === 'accepted'
        ? 'follower'
        : 'stranger';
  return getProfileFavorites(profile.userId, role);
}

/**
 * The locked view for a profile the viewer can't open (private, or
 * followers-only without an accepted follow). `asGuest` mirrors "Preview as
 * visitor".
 */
export async function getLockedProfileAction(username: string, opts: { asGuest?: boolean } = {}) {
  const session = await getSession();
  const viewerId = opts.asGuest ? null : (session?.userId ?? null);
  const { getLockedProfile } = await import('@/services/profile');
  return getLockedProfile(username, viewerId);
}

/** Owner: titles they can feature (favorites + watchlist titles), for the picker. */
export async function getFeatureCandidatesAction() {
  const session = await getSession();
  if (!session) throw new UnauthorizedAppError();
  const { getFeatureCandidates } = await import('@/services/profile/featured');
  return getFeatureCandidates(session.userId);
}

/** Owner: save the Feature presentation picks (empty = automatic). */
export async function saveFeaturedTitlesAction(
  picks: { mediaType: 'movie' | 'tv'; mediaId: string }[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await getSession();
  if (!session) return { ok: false, error: 'Please sign in again.' };
  try {
    const { setFeaturedTitles } = await import('@/services/profile/featured');
    await setFeaturedTitles(session.userId, picks);
    revalidatePath('/me');
    return { ok: true };
  } catch (err) {
    const { AppError } = await import('@/utils/errors');
    if (err instanceof AppError) return { ok: false, error: err.message };
    console.error('Save featured titles failed:', err);
    return { ok: false, error: 'Something went wrong. Please try again.' };
  }
}
