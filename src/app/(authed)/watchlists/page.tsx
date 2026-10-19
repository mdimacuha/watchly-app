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
    // First 12 poster previews per list for the cover scrub (the rest load
    // on hover via getWatchlistPreviewsAction) + watched / total runtime.
    listWatchlistsAction({ previews: 12, runtimes: true }),
    getAccentColorFor(userId),
  ]);

  return (
    <AccentScope accentColor={accentColor} className="px-4 sm:px-8 py-10">
      <WatchlistsPageClient watchlists={watchlists} />
    </AccentScope>
  );
}
