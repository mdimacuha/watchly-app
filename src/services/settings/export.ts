import { and, asc, eq, inArray } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '@/db';
import {
  favoriteShelfItems,
  favoriteShelves,
  titleAlerts,
  userFavorites,
  userFollows,
  userPreferences,
  userProfiles,
  userReviews,
  users,
  watchedTitles,
  watchlistItems,
  watchlists,
} from '@/db/schema';

// "Download my data": everything the user made, as one JSON document. Only
// the caller's own rows, only named columns — no password digests, salts,
// session/verification/API tokens, and no other users' data beyond the
// usernames on the user's own follow edges. Each list is capped.

const ROW_CAP = 5000;

export async function exportMyData(userId: string) {
  const following = alias(users, 'following_user');
  const follower = alias(users, 'follower_user');

  const [
    [account],
    [profile],
    [preferences],
    lists,
    favorites,
    shelves,
    watched,
    reviews,
    followingRows,
    followerRows,
    alerts,
  ] = await Promise.all([
    db
      .select({ username: users.username, email: users.email, firstName: users.firstName, lastName: users.lastName, createdAt: users.createdAt })
      .from(users)
      .where(eq(users.id, userId)),
    db
      .select({ displayName: userProfiles.displayName, bio: userProfiles.bio, avatarUrl: userProfiles.avatarUrl, accentColor: userProfiles.accentColor })
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId)),
    db
      .select({
        regionCode: userPreferences.regionCode,
        profileVisibility: userPreferences.profileVisibility,
        watchlistsVisibility: userPreferences.watchlistsVisibility,
        hideFavorites: userPreferences.hideFavorites,
        hideWatched: userPreferences.hideWatched,
        hideLikes: userPreferences.hideLikes,
        theme: userPreferences.theme,
        notificationSettings: userPreferences.notificationSettings,
      })
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId)),
    db
      .select({ id: watchlists.id, name: watchlists.name, description: watchlists.description, isPublic: watchlists.isPublic, createdAt: watchlists.createdAt })
      .from(watchlists)
      .where(eq(watchlists.userId, userId))
      .orderBy(asc(watchlists.createdAt))
      .limit(ROW_CAP),
    db
      .select({ id: userFavorites.id, type: userFavorites.favoriteType, tmdbId: userFavorites.favoriteId, createdAt: userFavorites.createdAt })
      .from(userFavorites)
      .where(eq(userFavorites.userId, userId))
      .orderBy(asc(userFavorites.createdAt))
      .limit(ROW_CAP),
    db
      .select({ id: favoriteShelves.id, name: favoriteShelves.name, isPublic: favoriteShelves.isPublic, createdAt: favoriteShelves.createdAt })
      .from(favoriteShelves)
      .where(eq(favoriteShelves.userId, userId))
      .orderBy(asc(favoriteShelves.sortOrder)),
    db
      .select({
        mediaType: watchedTitles.mediaType,
        tmdbId: watchedTitles.mediaId,
        loggedAt: watchedTitles.watchedAt,
        seenOn: watchedTitles.seenOn,
        seenPrecision: watchedTitles.seenPrecision,
        source: watchedTitles.source,
      })
      .from(watchedTitles)
      .where(eq(watchedTitles.userId, userId))
      .limit(ROW_CAP),
    db
      .select({
        mediaType: userReviews.titleType,
        tmdbId: userReviews.titleId,
        rating: userReviews.rating,
        body: userReviews.body,
        isSpoiler: userReviews.isSpoiler,
        createdAt: userReviews.createdAt,
        updatedAt: userReviews.updatedAt,
      })
      .from(userReviews)
      .where(eq(userReviews.userId, userId))
      .limit(ROW_CAP),
    db
      .select({ username: following.username, status: userFollows.status, since: userFollows.createdAt })
      .from(userFollows)
      .innerJoin(following, eq(following.id, userFollows.followingId))
      .where(eq(userFollows.followerId, userId))
      .limit(ROW_CAP),
    db
      .select({ username: follower.username, status: userFollows.status, since: userFollows.createdAt })
      .from(userFollows)
      .innerJoin(follower, eq(follower.id, userFollows.followerId))
      .where(and(eq(userFollows.followingId, userId), eq(userFollows.status, 'accepted')))
      .limit(ROW_CAP),
    db
      .select({
        mediaType: titleAlerts.mediaType,
        tmdbId: titleAlerts.mediaId,
        region: titleAlerts.region,
        whenStreaming: titleAlerts.notifyStreaming,
        whenLeaving: titleAlerts.notifyLeaving,
        whenNewSeason: titleAlerts.notifyNewSeason,
        createdAt: titleAlerts.createdAt,
      })
      .from(titleAlerts)
      .where(eq(titleAlerts.userId, userId)),
  ]);

  const listIds = lists.map((l) => l.id);
  const shelfIds = shelves.map((s) => s.id);
  const [items, shelfItems] = await Promise.all([
    listIds.length
      ? db
          .select({
            watchlistId: watchlistItems.watchlistId,
            mediaType: watchlistItems.mediaType,
            tmdbId: watchlistItems.mediaId,
            status: watchlistItems.status,
            notes: watchlistItems.notes,
            startedAt: watchlistItems.startedAt,
            finishedAt: watchlistItems.finishedAt,
            addedAt: watchlistItems.createdAt,
          })
          .from(watchlistItems)
          .where(inArray(watchlistItems.watchlistId, listIds))
          .orderBy(asc(watchlistItems.sortOrder))
          .limit(ROW_CAP)
      : Promise.resolve([]),
    shelfIds.length
      ? db
          .select({ shelfId: favoriteShelfItems.shelfId, favoriteId: favoriteShelfItems.favoriteId })
          .from(favoriteShelfItems)
          .where(inArray(favoriteShelfItems.shelfId, shelfIds))
      : Promise.resolve([]),
  ]);

  const favKeyById = new Map(favorites.map((f) => [f.id, `${f.type}:${f.tmdbId}`]));

  return {
    format: 'watchly-export',
    version: 1,
    exportedAt: new Date().toISOString(),
    account: account ?? null,
    profile: profile ?? null,
    preferences: preferences ?? null,
    watchlists: lists.map((l) => ({
      name: l.name,
      description: l.description,
      isPublic: l.isPublic,
      createdAt: l.createdAt,
      items: items
        .filter((i) => i.watchlistId === l.id)
        .map((i) => ({ mediaType: i.mediaType, tmdbId: i.tmdbId, status: i.status, notes: i.notes, startedAt: i.startedAt, finishedAt: i.finishedAt, addedAt: i.addedAt })),
    })),
    favorites: favorites.map((f) => ({ type: f.type, tmdbId: f.tmdbId, createdAt: f.createdAt })),
    shelves: shelves.map((s) => ({
      name: s.name,
      isPublic: s.isPublic,
      createdAt: s.createdAt,
      favorites: shelfItems
        .filter((i) => i.shelfId === s.id)
        .map((i) => favKeyById.get(i.favoriteId))
        .filter((k): k is string => !!k),
    })),
    watched,
    reviews,
    following: followingRows,
    followers: followerRows,
    titleAlerts: alerts,
  };
}
