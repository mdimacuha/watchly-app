import { Heart } from 'lucide-react';
import { getEnrichedFavoritesAction } from '@/actions/favorites';
import { FavoritesPageClient } from '@/components/favorites/FavoritesPageClient';
import { requireUser } from '@/server/auth/requireUser';

export default async function FavoritesPage() {
  // Validates the session against the DB so a stale cookie produces a
  // clean redirect to /signin instead of crashing on the action throw.
  await requireUser();
  const favorites = await getEnrichedFavoritesAction();

  return (
    <div className="px-8 py-10">
      <div className="flex items-center gap-3 mb-2">
        <Heart size={24} className="text-primary" />
        <h1 className="text-h2">Favorites</h1>
      </div>
      <p className="text-muted-foreground text-body-regular max-w-lg mb-8">
        Your all-time favorite movies and shows, all in one place.
      </p>
      <FavoritesPageClient favorites={favorites} />
    </div>
  );
}
