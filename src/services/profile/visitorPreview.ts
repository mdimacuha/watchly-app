import { and, count, eq, isNotNull } from 'drizzle-orm';
import { db } from '@/db';
import { favoriteShelves, userReviews, watchlists } from '@/db/schema';
import { getUserPreferencesRow } from '@/services/users/rows';
import { getProfileWithStats, visibilityPrefsOf } from './index';
import { resolveProfileVisibility, type PrivacyLevel, type ViewerRole } from './visibility';

// Settings' "what visitors see": the owner's profile run through the same
// rules the public profile uses (resolveProfileVisibility), for a stranger
// and for a follower, plus the exceptions people trip over.

export type PreviewRole = Extract<ViewerRole, 'stranger' | 'follower'>;

export interface PreviewArea {
  key: 'watchlists' | 'favorites' | 'shelves' | 'watched' | 'reviews';
  label: string;
  visible: boolean;
  /** How many items this visitor sees in the area. */
  count: number;
}

export interface PreviewNote {
  tone: 'warning' | 'info';
  text: string;
}

export interface VisitorView {
  role: PreviewRole;
  /** The profile opens; otherwise they get the locked view. */
  opens: boolean;
  areas: PreviewArea[];
  notes: PreviewNote[];
}

export interface VisitorPreview {
  owner: {
    username: string;
    displayName: string;
    firstName: string;
    lastName: string;
    avatarUrl: string;
    accentColor: string | null;
  };
  profileVisibility: PrivacyLevel;
  views: Record<PreviewRole, VisitorView>;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export async function getVisitorPreview(ownerId: string): Promise<VisitorPreview> {
  const [profile, prefsRow, listRows, shelfRows, [{ reviews }]] = await Promise.all([
    getProfileWithStats(ownerId),
    getUserPreferencesRow(ownerId),
    db.select({ isPublic: watchlists.isPublic }).from(watchlists).where(eq(watchlists.userId, ownerId)),
    db
      .select({ name: favoriteShelves.name, isPublic: favoriteShelves.isPublic })
      .from(favoriteShelves)
      .where(eq(favoriteShelves.userId, ownerId)),
    db
      .select({ reviews: count() })
      .from(userReviews)
      .where(and(eq(userReviews.userId, ownerId), isNotNull(userReviews.body))),
  ]);
  const prefs = visibilityPrefsOf(prefsRow);
  const publicLists = listRows.filter((l) => l.isPublic).length;
  const privateLists = listRows.length - publicLists;
  const publicShelves = shelfRows.filter((s) => s.isPublic);

  const view = (role: PreviewRole): VisitorView => {
    const v = resolveProfileVisibility(prefs, role);
    const areas: PreviewArea[] = [
      { key: 'watchlists', label: 'Watchlists', visible: v.watchlists, count: v.watchlists ? publicLists : 0 },
      { key: 'favorites', label: 'Favorites', visible: v.favorites, count: v.favorites ? profile.stats.favoritesCount : 0 },
      {
        key: 'shelves',
        label: 'Public shelves',
        visible: v.publicShelves && publicShelves.length > 0,
        count: v.publicShelves ? publicShelves.length : 0,
      },
      { key: 'watched', label: 'Watched', visible: v.watched, count: v.watched ? profile.stats.watchedCount : 0 },
      { key: 'reviews', label: 'Reviews', visible: v.profile, count: v.profile ? reviews : 0 },
    ];

    const notes: PreviewNote[] = [];
    if (!v.profile) {
      notes.push({
        tone: 'info',
        text:
          prefs.profileVisibility === 'private'
            ? 'They see a locked profile: your name, photo and follower counts. Private stays closed even to followers.'
            : 'They see a locked profile with a Follow button. It opens once you accept their request.',
      });
    } else {
      if (prefs.hideFavorites && publicShelves.length > 0) {
        notes.push({
          tone: 'warning',
          text: `Favorites are hidden, but ${plural(publicShelves.length, 'public shelf', 'public shelves')} still ${
            publicShelves.length === 1 ? 'shows' : 'show'
          }: ${publicShelves.map((s) => s.name).join(', ')}.`,
        });
      }
      if (v.watchlists && privateLists > 0) {
        notes.push({ tone: 'info', text: `${plural(privateLists, 'list')} marked private never ${privateLists === 1 ? 'shows' : 'show'}.` });
      }
      if (!v.watchlists && publicLists > 0) {
        notes.push({ tone: 'info', text: 'Your watchlists are for followers only.' });
      }
    }
    if (reviews > 0) {
      notes.push({ tone: 'info', text: 'Written reviews always show on the title pages you reviewed.' });
    }
    return { role, opens: v.profile, areas, notes };
  };

  return {
    owner: {
      username: profile.username,
      displayName: profile.displayName,
      firstName: profile.firstName,
      lastName: profile.lastName,
      avatarUrl: profile.avatarUrl,
      accentColor: profile.accentColor,
    },
    profileVisibility: prefs.profileVisibility,
    views: { stranger: view('stranger'), follower: view('follower') },
  };
}
