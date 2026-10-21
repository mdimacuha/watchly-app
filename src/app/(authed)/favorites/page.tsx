import { getEnrichedFavoritesAction, listShelvesAction } from '@/actions/favorites';
import { FavoritesPageClient } from '@/components/favorites/FavoritesPageClient';
import { requireUser } from '@/server/auth/requireUser';

export default async function FavoritesPage() {
  // Validates the session against the DB so a stale cookie produces a
  // clean redirect to /signin instead of crashing on the action throw.
  await requireUser();
  const [favorites, shelves] = await Promise.all([getEnrichedFavoritesAction(), listShelvesAction()]);

  return (
    <div className="px-4 sm:px-8 py-10 max-w-6xl mx-auto w-full">
      <FavoritesPageClient favorites={favorites} shelves={shelves} />
    </div>
  );
}
