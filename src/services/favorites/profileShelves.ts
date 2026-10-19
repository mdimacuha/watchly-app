import { getUserPreferencesRow } from '@/services/users/rows';
import { visibilityPrefsOf } from '@/services/profile';
import { resolveProfileVisibility, type ViewerRole } from '@/services/profile/visibility';
import { getEnrichedFavorites, type EnrichedFavorite } from './enrich';
import { listShelves, type Shelf } from './shelves';

// Favorites as the profile's Library shows them. Visibility, in order:
//   1. The owner sees everything (private shelves flagged).
//   2. Visitors see every public shelf, even when favorites are hidden.
//   3. Visitors see "All favorites" only when favorites aren't hidden.
// Favorites that sit on no visible shelf never leave the server when hidden.

export interface ProfileShelf extends Shelf {
  items: EnrichedFavorite[];
}

export interface ProfileFavorites {
  /** Every favorite; null when the owner hides favorites from this viewer. */
  all: EnrichedFavorite[] | null;
  shelves: ProfileShelf[];
}

const favKey = (f: EnrichedFavorite) => `${f.type}:${f.favoriteId}`;

export async function getProfileFavorites(ownerId: string, role: ViewerRole): Promise<ProfileFavorites> {
  const isSelf = role === 'owner';
  const [prefs, shelves] = await Promise.all([getUserPreferencesRow(ownerId), listShelves(ownerId)]);
  // Same rules as the profile and the Settings preview (profile/visibility.ts).
  const rules = resolveProfileVisibility(visibilityPrefsOf(prefs), role);
  const showAll = rules.favorites;
  const visible = isSelf ? shelves.shelves : rules.publicShelves ? shelves.shelves.filter((s) => s.isPublic) : [];
  if (!showAll && visible.length === 0) return { all: null, shelves: [] };

  const favorites = await getEnrichedFavorites(ownerId);
  const byKey = new Map(favorites.map((f) => [favKey(f), f]));

  return {
    all: showAll ? favorites : null,
    shelves: [...visible]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((shelf) => ({
        ...shelf,
        items: shelves.items
          .filter((i) => i.shelfId === shelf.id)
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((i) => byKey.get(i.favoriteKey))
          .filter((f): f is EnrichedFavorite => !!f),
      })),
  };
}
