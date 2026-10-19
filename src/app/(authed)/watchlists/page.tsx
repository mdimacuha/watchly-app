import { Bookmark } from 'lucide-react';
import { listWatchlistsAction } from '@/actions/watchlists';
import { WatchlistsPageClient } from '@/components/watchlists/WatchlistsPageClient';
import { requireUser } from '@/server/auth/requireUser';
import { AccentScope } from '@/components/profile/AccentScope';
import { getAccentColorFor } from '@/services/profile/accentCache';

export default async function WatchlistsPage() {
  // Page-level guard since middleware no longer prefix-matches /watchlists.
  const userId = await requireUser();
  // Accent comes from the shared per-user cache the layouts already use,
  // instead of a fresh DB query on every visit.
  const [watchlists, accentColor] = await Promise.all([
    listWatchlistsAction(),
    getAccentColorFor(userId),
  ]);

  return (
    <AccentScope accentColor={accentColor} className="px-8 py-10">
      <div className="flex items-center gap-3 mb-4">
        <Bookmark size={24} className="text-primary" />
        <h1 className="text-h2">Watchlists</h1>
      </div>
      <WatchlistsPageClient watchlists={watchlists} />
    </AccentScope>
  );
}
