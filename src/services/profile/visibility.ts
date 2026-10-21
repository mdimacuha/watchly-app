// Who sees what on a profile — the one place these rules live. The public
// profile, the Library's favorites and Settings' "what visitors see" preview
// all call `resolveProfileVisibility`, so the preview can't drift from what
// visitors actually get.

export type PrivacyLevel = 'public' | 'followers_only' | 'private';

/** How the viewer relates to the owner. Blocks are handled before this (they 404). */
export type ViewerRole = 'owner' | 'follower' | 'stranger';

export interface VisibilityPrefs {
  profileVisibility: PrivacyLevel;
  watchlistsVisibility: PrivacyLevel;
  hideFavorites: boolean;
  hideWatched: boolean;
  hideLikes: boolean;
}

export interface ProfileVisibility {
  /** The profile opens at all (otherwise: the locked view — name, avatar, counts). */
  profile: boolean;
  /** Public watchlists show (lists marked private never do). */
  watchlists: boolean;
  /** "All favorites" shows. Public shelves show whenever `profile` does. */
  favorites: boolean;
  /** Public shelves show (even when favorites are hidden). */
  publicShelves: boolean;
  watched: boolean;
  /** Likes from Watchly Swipe and the For You reel. */
  likes: boolean;
}

/** Defaults for a missing preferences row (matches the column defaults). */
export const DEFAULT_VISIBILITY_PREFS: VisibilityPrefs = {
  profileVisibility: 'public',
  watchlistsVisibility: 'public',
  hideFavorites: false,
  hideWatched: true,
  hideLikes: true,
};

const opens = (level: PrivacyLevel, role: ViewerRole) =>
  level === 'public' || (level === 'followers_only' && role === 'follower');

export function resolveProfileVisibility(prefs: VisibilityPrefs, role: ViewerRole): ProfileVisibility {
  if (role === 'owner') {
    return { profile: true, watchlists: true, favorites: true, publicShelves: true, watched: true, likes: true };
  }
  // Private is closed to followers too; followers-only opens to accepted followers.
  if (!opens(prefs.profileVisibility, role)) {
    return { profile: false, watchlists: false, favorites: false, publicShelves: false, watched: false, likes: false };
  }
  return {
    profile: true,
    watchlists: opens(prefs.watchlistsVisibility, role),
    favorites: !prefs.hideFavorites,
    publicShelves: true,
    watched: !prefs.hideWatched,
    likes: !prefs.hideLikes,
  };
}
