import { Bookmark } from 'lucide-react';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { userProfiles } from '@/db/schema';
import { listWatchlistsAction } from '@/actions/watchlists';
import { WatchlistsPageClient } from '@/components/watchlists/WatchlistsPageClient';
import { requireUser } from '@/server/auth/requireUser';
import { AccentScope } from '@/components/profile/AccentScope';
import { ACCENT_SLUGS, type AccentSlug } from '@/constants/accentColors';

function asAccentSlug(v: string | null | undefined): AccentSlug | null {
  return v && (ACCENT_SLUGS as readonly string[]).includes(v)
    ? (v as AccentSlug)
    : null;
}

export default async function WatchlistsPage() {
  // Page-level guard since middleware no longer prefix-matches /watchlists.
  const userId = await requireUser();
  const [watchlists, profileRow] = await Promise.all([
    listWatchlistsAction(),
    db
      .select({ accentColor: userProfiles.accentColor })
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId))
      .limit(1)
      .then((rows) => rows[0]),
  ]);

  return (
    <AccentScope
      accentColor={asAccentSlug(profileRow?.accentColor)}
      className="px-8 py-10"
    >
      <div className="flex items-center gap-3 mb-4">
        <Bookmark size={24} className="text-primary" />
        <h1 className="text-h2">Watchlists</h1>
      </div>
      <WatchlistsPageClient watchlists={watchlists} />
    </AccentScope>
  );
}
