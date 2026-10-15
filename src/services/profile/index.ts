import { db } from '@/db';
import {
  users,
  userProfiles,
  userFavorites,
  watchlists,
} from '@/db/schema';
import { and, eq, sql } from 'drizzle-orm';
import { ValidationAppError, NotFoundAppError, ForbiddenAppError } from '@/utils/errors';
import {
  updateProfileSchema,
  type UpdateProfileInput,
} from './validators';
import { getFavorites } from '@/services/favorites';
import { enrichFavorites, type EnrichedFavorite } from '@/services/favorites/enrich';
import {
  listWatchlists,
  listPublicWatchlists,
  type WatchlistWithCount,
} from '@/services/watchlists';
import { getActivity } from '@/services/activity/getActivity';
import type { ActivityItem } from '@/services/activity/types';
import { getUserRegion } from '@/services/preferences';
import {
  getUserRowById,
  getUserProfileRow,
  getUserPreferencesRow,
} from '@/services/users/rows';
import { tmdbFetch } from '@/server/tmdb/client';
import { ACCENT_SLUGS, type AccentSlug } from '@/constants/accentColors';
import { cleanProviderName } from '@/utils/providers';

function isAccentSlug(v: string | null | undefined): v is AccentSlug {
  return (
    typeof v === 'string' &&
    (ACCENT_SLUGS as readonly string[]).includes(v)
  );
}

// Used by getTasteProfile to count flatrate providers for one favorite into
// a running tally. Each cleaned provider name contributes at most one count
// per favorite so multi-tier listings (e.g. "Netflix" + "Netflix with Ads")
// don't double-count.
function tallyFlatrate(
  data:
    | { flatrate?: Array<{ provider_name: string }> }
    | undefined,
  tally: Map<string, number>,
): void {
  if (!data?.flatrate) return;
  const seenThisFavorite = new Set<string>();
  for (const p of data.flatrate) {
    const name = cleanProviderName(p.provider_name);
    if (seenThisFavorite.has(name)) continue;
    seenThisFavorite.add(name);
    tally.set(name, (tally.get(name) ?? 0) + 1);
  }
}

const RECENT_FAVORITES_LIMIT = 6;
const RECENT_WATCHLISTS_LIMIT = 3;
const RECENT_ACTIVITY_LIMIT = 5;
const TASTE_SAMPLE_LIMIT = 50;
const TOP_GENRES = 5;
const TOP_DECADES = 3;
const TOP_PROVIDERS = 3;

export interface TasteProfile {
  /** Top genre names, most-frequent first. */
  genres: string[];
  /** Top decades as e.g. "2020s", "1990s". */
  decades: string[];
  /** Top streaming providers (flatrate) the user's favorites are available on. */
  providers: string[];
}

export interface ProfileOverview {
  profile: ProfileView;
  recentWatchlists: WatchlistWithCount[];
  recentFavorites: EnrichedFavorite[];
  recentActivity: ActivityItem[];
  tasteProfile: TasteProfile;
  /** Suggested accounts to follow — empty when the user already follows
   *  everyone popular or is the first user in a fresh deploy. */
  followSuggestions: import('@/services/social').PublicUserCard[];
  /** Banner poster URLs. Empty when the user hasn't favorited anything,
   *  or when bannerEnabled is false. */
  bannerPosters: string[];
  /** Most-recently watched titles, enriched with TMDB poster/title. */
  watchedTitles: import('@/services/watched').EnrichedWatched[];
}

export type ProfileView = {
  userId: string;
  username: string;
  firstName: string;
  lastName: string;
  displayName: string;
  bio: string;
  avatarUrl: string;
  memberSince: Date;
  region: string;
  /** Accent palette slug (see src/constants/accentColors.ts) or null = default. */
  accentColor: AccentSlug | null;
  /** When true (default), profile pages render a poster-collage banner. */
  bannerEnabled: boolean;
  /** Owner's choice to hide their watched list from the public profile.
   *  Defaults to true (watched data is more intimate than favorites). */
  hideWatched: boolean;
  stats: {
    favoritesCount: number;
    watchlistsCount: number;
    /** Merged count: watched_titles UNION watchlist_items.status='finished'. */
    watchedCount: number;
  };
  profileVisibility: 'public' | 'followers_only' | 'private';
};

/**
 * Updates the user's profile (display name, bio, avatar).
 *
 * The avatar URL is kept in sync between `users.avatarUrl` (used by the auth
 * store / sidebar) and `user_profiles.avatarUrl` (used by the profile page)
 * via a transaction.
 */
export async function updateProfile(userId: string, input: UpdateProfileInput) {
  const parsed = updateProfileSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationAppError('Invalid profile input', parsed.error.flatten());
  }

  const { displayName, bio, avatarUrl, accentColor } = parsed.data;

  // Moderate public-facing text. Display name is required + bounded;
  // bio is optional + longer. Generic external message on slur /
  // profanity match — specific reason internal-only.
  const { moderateText } = await import(
    '@/services/moderation/contentModeration'
  );
  const { logger } = await import('@/lib/log');

  const displayCheck = moderateText(displayName, {
    minLength: 1,
    maxLength: 50,
  });
  if (!displayCheck.allowed) {
    logger.warn('[profile] display name rejected', {
      userId,
      reason: displayCheck.reason,
    });
    throw new ValidationAppError(
      displayCheck.reason === 'profanity' ||
        displayCheck.reason === 'racial_offensive'
        ? 'This display name is not allowed.'
        : displayCheck.message ?? 'Invalid display name.',
    );
  }

  if (bio && bio.length > 0) {
    const bioCheck = moderateText(bio, { maxLength: 160, allowEmpty: true });
    if (!bioCheck.allowed) {
      logger.warn('[profile] bio rejected', {
        userId,
        reason: bioCheck.reason,
      });
      throw new ValidationAppError(
        bioCheck.reason === 'profanity' ||
          bioCheck.reason === 'racial_offensive'
          ? 'This bio is not allowed.'
          : bioCheck.message ?? 'Invalid bio.',
      );
    }
  }

  const normalizedAvatar = avatarUrl ?? '';
  // accentColor: `undefined` = caller didn't include it (leave existing value).
  // `null` = caller is clearing it back to default. Otherwise = new slug.
  const includeAccent = accentColor !== undefined;

  return db.transaction(async (tx) => {
    const [updatedProfile] = await tx
      .update(userProfiles)
      .set({
        displayName,
        bio: bio ?? '',
        avatarUrl: normalizedAvatar,
        ...(includeAccent && { accentColor }),
        updatedAt: new Date(),
      })
      .where(eq(userProfiles.userId, userId))
      .returning();

    // Mirror to the auth-side user row so the sidebar / auth store stay
    // accurate after the user re-hydrates.
    await tx
      .update(users)
      .set({ avatarUrl: normalizedAvatar, updatedAt: new Date() })
      .where(eq(users.id, userId));

    return updatedProfile;
  });
}

/**
 * Returns the current user's profile view including stats. For the /me page.
 */
export async function getProfileWithStats(userId: string): Promise<ProfileView> {
  // Independent per-user rows — fetch concurrently, deduped per request
  // via the cached accessors so other helpers in the same request reuse
  // them instead of re-querying.
  const [userRow, profileRow, prefsRow] = await Promise.all([
    getUserRowById(userId),
    getUserProfileRow(userId),
    getUserPreferencesRow(userId),
  ]);
  if (!userRow) throw new NotFoundAppError('User not found');

  const [favCount, listCount, watchedCount] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(userFavorites)
      .where(eq(userFavorites.userId, userId))
      .then((rows) => rows[0]?.count ?? 0),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(watchlists)
      .where(eq(watchlists.userId, userId))
      .then((rows) => rows[0]?.count ?? 0),
    import('@/services/watched').then((m) => m.getWatchedCount(userId)),
  ]);

  return {
    userId: userRow.id,
    username: userRow.username,
    firstName: userRow.firstName,
    lastName: userRow.lastName,
    displayName: profileRow?.displayName ?? '',
    bio: profileRow?.bio ?? '',
    avatarUrl: profileRow?.avatarUrl || userRow.avatarUrl || '',
    memberSince: userRow.createdAt,
    region: prefsRow?.regionCode ?? 'PH',
    // Validate against the known slug set on read — DB stores arbitrary text
    // (see schema comment) so we can't trust the value blindly.
    accentColor: isAccentSlug(profileRow?.accentColor) ? profileRow!.accentColor : null,
    bannerEnabled: profileRow?.bannerEnabled ?? true,
    hideWatched: prefsRow?.hideWatched ?? true,
    stats: {
      favoritesCount: favCount,
      watchlistsCount: listCount,
      watchedCount,
    },
    profileVisibility: prefsRow?.profileVisibility ?? 'public',
  };
}

/**
 * Bundles the current user's profile + previews so the /me page renders in a
 * single round-trip.
 */
export async function getMyProfileOverview(userId: string): Promise<ProfileOverview> {
  // Read region first so taste-providers can be scoped to it. Tiny DB query;
  // the heavy work (TMDB fetches inside getTasteProfile) follows in parallel.
  const region = (await getUserRegion(userId).catch(() => null)) ?? 'PH';
  const [
    profile,
    rawFavorites,
    recentWatchlists,
    activityResponse,
    tasteProfile,
    followSuggestions,
    watchedTitles,
  ] = await Promise.all([
    getProfileWithStats(userId),
    getFavorites(userId, { limit: RECENT_FAVORITES_LIMIT }),
    listWatchlists(userId).then((lists) => lists.slice(0, RECENT_WATCHLISTS_LIMIT)),
    getActivity(userId),
    getTasteProfile(userId, { region }),
    import('@/services/social').then((m) =>
      m.getFollowSuggestions(userId, { limit: 10 }),
    ),
    import('@/services/watched').then((m) =>
      m.getEnrichedWatched(userId, { take: 60 }),
    ),
  ]);
  const recentFavorites = await enrichFavorites(rawFavorites);
  const recentActivity = activityResponse.items.slice(0, RECENT_ACTIVITY_LIMIT);

  // Banner posters only when opt-in is on — saves N TMDB lookups per /me
  // load for users who switched the banner off.
  const bannerPosters = profile.bannerEnabled
    ? await import('@/services/profile/banner').then((m) =>
        m.getBannerPosters(userId),
      )
    : [];

  return {
    profile,
    recentWatchlists,
    recentFavorites,
    recentActivity,
    tasteProfile,
    followSuggestions,
    bannerPosters,
    watchedTitles,
  };
}

interface WatchProvidersBlock {
  results?: Record<
    string,
    {
      flatrate?: Array<{ provider_name: string }>;
    }
  >;
}

/**
 * Aggregate the user's favorite + watched movies + TV shows into a
 * taste summary: top genres, decades, and streaming providers. Pulls
 * from BOTH favorites and watched titles (deduped by mediaType+mediaId
 * — a watched favorite is counted once) so accounts that have marked
 * many titles watched but only favorited a few still get a rich taste
 * read. Capped at TASTE_SAMPLE_LIMIT total inputs to keep TMDB fan-out
 * bounded.
 *
 * Providers are tallied from the user's region's flatrate. If the user's
 * region produced no provider hits (small/missing TMDB coverage), falls
 * back to US flatrate so the section isn't empty for non-US users with
 * spotty regional data.
 */
export async function getTasteProfile(
  userId: string,
  options: { region?: string } = {},
): Promise<TasteProfile> {
  const region = options.region ?? 'US';

  // Sample sources in parallel — all three are bounded reads.
  const [favorites, watchedEntries, swipeSignals] = await Promise.all([
    getFavorites(userId, { limit: TASTE_SAMPLE_LIMIT }),
    import('@/services/watched').then((m) => m.getWatchedEntries(userId)),
    import('@/services/swipe').then((m) => m.getSwipeSignals(userId)),
  ]);

  // Inputs = favorites ∪ watched ∪ saved-swipes ∪ liked-swipes. Order
  // matters: stronger signals first, since once we hit
  // TASTE_SAMPLE_LIMIT we stop adding. Dedup so a title appearing in
  // multiple sources contributes one tally per facet, not three.
  type TasteInput = { mediaType: 'movie' | 'tv'; mediaId: string };
  const seen = new Set<string>();
  const inputs: TasteInput[] = [];

  for (const f of favorites) {
    if (f.favoriteType !== 'movie' && f.favoriteType !== 'tv') continue;
    const key = `${f.favoriteType}:${f.favoriteId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    inputs.push({ mediaType: f.favoriteType, mediaId: f.favoriteId });
    if (inputs.length >= TASTE_SAMPLE_LIMIT) break;
  }
  for (const w of watchedEntries) {
    if (inputs.length >= TASTE_SAMPLE_LIMIT) break;
    const key = `${w.mediaType}:${w.mediaId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    inputs.push({ mediaType: w.mediaType, mediaId: w.mediaId });
  }
  // Swipes flow in last so they only consume sample slots when there's
  // headroom after favorites + watched. Saved first (stronger intent)
  // then liked.
  const swipeOrdered = [...swipeSignals.saved, ...swipeSignals.liked];
  for (const s of swipeOrdered) {
    if (inputs.length >= TASTE_SAMPLE_LIMIT) break;
    if (s.titleType !== 'movie' && s.titleType !== 'tv') continue;
    const key = `${s.titleType}:${s.titleId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    inputs.push({ mediaType: s.titleType, mediaId: s.titleId });
  }

  if (inputs.length === 0) return { genres: [], decades: [], providers: [] };

  const genreCounts = new Map<string, number>();
  const decadeCounts = new Map<string, number>();
  const regionProviderCounts = new Map<string, number>();
  const usProviderCounts = new Map<string, number>();

  await Promise.all(
    inputs.map(async (input) => {
      try {
        const raw = await tmdbFetch<{
          genres?: Array<{ name: string }>;
          release_date?: string;
          first_air_date?: string;
          'watch/providers'?: WatchProvidersBlock;
        }>(`/${input.mediaType}/${input.mediaId}`, {
          append_to_response: 'watch/providers',
        });

        for (const g of raw.genres ?? []) {
          if (g.name) {
            genreCounts.set(g.name, (genreCounts.get(g.name) ?? 0) + 1);
          }
        }
        const date =
          input.mediaType === 'movie' ? raw.release_date : raw.first_air_date;
        if (date) {
          const year = parseInt(date.slice(0, 4), 10);
          if (!Number.isNaN(year)) {
            const decade = `${Math.floor(year / 10) * 10}s`;
            decadeCounts.set(decade, (decadeCounts.get(decade) ?? 0) + 1);
          }
        }

        // Tally flatrate provider names for both the user's region and US.
        // Each input contributes at most one count per provider — multiple
        // tiers of the same service (e.g. "Netflix" + "Netflix Standard with
        // Ads") collapse via cleanProviderName.
        const regionData = raw['watch/providers']?.results?.[region];
        tallyFlatrate(regionData, regionProviderCounts);
        if (region !== 'US') {
          const us = raw['watch/providers']?.results?.['US'];
          tallyFlatrate(us, usProviderCounts);
        }
      } catch {
        // TMDB fetch failed for this item; skip silently.
      }
    }),
  );

  const topByCount = (m: Map<string, number>, n: number): string[] =>
    [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([k]) => k);

  // Prefer the user's region; fall back to US only if region produced nothing.
  // Avoids the misleading "your taste streams on Hulu" when the user is in PH
  // and TMDB just lacks PH data for their favorites.
  const providerSource =
    regionProviderCounts.size > 0 ? regionProviderCounts : usProviderCounts;

  return {
    genres: topByCount(genreCounts, TOP_GENRES),
    decades: topByCount(decadeCounts, TOP_DECADES),
    providers: topByCount(providerSource, TOP_PROVIDERS),
  };
}

/**
 * Public view of a user's profile by username. Throws if not found or if the
 * profile visibility doesn't permit `viewerId` to read it.
 */
export async function getPublicProfileByUsername(
  username: string,
  viewerId: string | null,
): Promise<ProfileView> {
  const userRow = await db.query.users.findFirst({
    where: and(
      eq(users.username, username),
      eq(users.isDeleted, false),
    ),
  });
  if (!userRow) throw new NotFoundAppError('User not found');

  const prefsRow = await getUserPreferencesRow(userRow.id);
  const visibility = prefsRow?.profileVisibility ?? 'public';
  const isSelf = viewerId === userRow.id;

  // `followers_only` is treated as private until the social feature lands
  // (no follow-graph reads available yet).
  if (!isSelf && visibility !== 'public') {
    throw new ForbiddenAppError('This profile is private');
  }

  return getProfileWithStats(userRow.id);
}

/**
 * Public profile overview = profile + public watchlists + recent favorites.
 * The viewer sees their own profile in full if they request their own page.
 */
export async function getPublicProfileOverview(
  username: string,
  viewerId: string | null,
): Promise<{
  profile: ProfileView;
  publicWatchlists: WatchlistWithCount[];
  recentFavorites: EnrichedFavorite[];
  /** True when the owner has chosen to hide favorites from their public profile. */
  favoritesHidden: boolean;
  /** True when the owner has chosen to hide watched titles. Owners
   *  still see their own list — this flag controls the public surface. */
  watchedHidden: boolean;
  /** Enriched watched list, empty when watchedHidden=true for non-self. */
  watchedTitles: import('@/services/watched').EnrichedWatched[];
  tasteProfile: TasteProfile;
  isSelf: boolean;
  /** Follow/block edge between viewer and target. null status for unauth. */
  followState: import('@/services/social').FollowState;
  /** Followers + following counts on the target. */
  followSummary: import('@/services/social').FollowSummary;
  /** Up to 5 mutual followers + total count for the "Followed by X, Y…" line. */
  mutualFollowers: {
    users: import('@/services/social').PublicUserCard[];
    totalCount: number;
  };
  /** Banner poster URLs (empty when disabled or no favorites). */
  bannerPosters: string[];
}> {
  const profile = await getPublicProfileByUsername(username, viewerId);
  const isSelf = viewerId === profile.userId;

  // Read the owner's hide-favorites / hide-watched preferences. Owners
  // always see their own data regardless of these flags. Cached accessor
  // reuses the row already loaded by getProfileWithStats this request.
  const prefsRow = await getUserPreferencesRow(profile.userId);
  const ownerHidesFavorites = prefsRow?.hideFavorites ?? false;
  const ownerHidesWatched = prefsRow?.hideWatched ?? true;
  const showFavoritesToViewer = isSelf || !ownerHidesFavorites;
  const showWatchedToViewer = isSelf || !ownerHidesWatched;

  // Public taste profile is scoped to the *owner's* region (matching the
  // accent-visibility decision — pages adopt the owner's context, not the
  // viewer's). profile.region already came from the prefsRow read above
  // via getProfileWithStats.
  const [
    publicWatchlists,
    rawFavorites,
    tasteProfile,
    followState,
    followSummary,
    mutualFollowers,
    watchedTitles,
  ] = await Promise.all([
    listPublicWatchlists(profile.userId),
    showFavoritesToViewer
      ? getFavorites(profile.userId, { limit: RECENT_FAVORITES_LIMIT })
      : Promise.resolve([] as Awaited<ReturnType<typeof getFavorites>>),
    getTasteProfile(profile.userId, { region: profile.region }),
    // Social calls — dynamic import to keep this file's static graph small.
    import('@/services/social').then((m) =>
      m.getFollowState(viewerId, profile.userId),
    ),
    import('@/services/social').then((m) => m.getFollowSummary(profile.userId)),
    viewerId
      ? import('@/services/social').then((m) =>
          m.getMutualFollowers(viewerId, profile.userId, { limit: 5 }),
        )
      : Promise.resolve({ users: [], totalCount: 0 }),
    showWatchedToViewer
      ? import('@/services/watched').then((m) =>
          m.getEnrichedWatched(profile.userId, { take: 60 }),
        )
      : Promise.resolve(
          [] as Awaited<
            ReturnType<typeof import('@/services/watched').getEnrichedWatched>
          >,
        ),
  ]);
  const recentFavorites = await enrichFavorites(rawFavorites);

  const bannerPosters = profile.bannerEnabled
    ? await import('@/services/profile/banner').then((m) =>
        m.getBannerPosters(profile.userId),
      )
    : [];

  return {
    profile,
    publicWatchlists,
    recentFavorites,
    favoritesHidden: ownerHidesFavorites && !isSelf,
    watchedHidden: ownerHidesWatched && !isSelf,
    watchedTitles,
    tasteProfile,
    isSelf,
    followState,
    followSummary,
    mutualFollowers,
    bannerPosters,
  };
}
