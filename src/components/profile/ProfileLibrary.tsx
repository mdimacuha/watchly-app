'use client';

import { useEffect, useState } from 'react';
import { Lock } from 'lucide-react';
import { WatchedTickets, type WatchedLocal } from '@/components/profile/WatchedTickets';
import { cn } from '@/lib/cn';
import { getAccent } from '@/constants/accentColors';
import { WatchlistCoverCard } from '@/components/watchlists/WatchlistCoverCard';
import { ShelfRail } from '@/components/favorites/shelfParts';
import { trackProfile } from '@/client/profileEvents';
import { getProfileFavoritesAction, type ProfileShowcase } from '@/actions/profile';
import { prefetch, useCachedLoad } from '@/client/cachedLoad';
import type { ProfileFavorites } from '@/services/favorites/profileShelves';

// The profile's Library: Watchlists · Favorites · Watched as sub-tabs.
// Watchlists reuse the list page's cover cards (read-only), favorites are
// shelves as spined rails, and watched titles are an archive of ticket stubs.

type Section = 'watchlists' | 'favorites' | 'watched';
const SECTIONS: { id: Section; label: string }[] = [
  { id: 'watchlists', label: 'Watchlists' },
  { id: 'favorites', label: 'Favorites' },
  { id: 'watched', label: 'Watched' },
];

export function ProfileLibrary({
  showcase,
  preview,
  watchedLocal,
  onWatchedLocalChange,
}: {
  showcase: ProfileShowcase;
  preview: boolean;
  /** Watched tab changes this visit (owned by the profile so they survive tab switches). */
  watchedLocal: WatchedLocal;
  onWatchedLocalChange: (next: (cur: WatchedLocal) => WatchedLocal) => void;
}) {
  const [section, setSection] = useState<Section>('watchlists');
  const { overview } = showcase;
  const pid = overview.profile.userId;
  const owner = overview.isSelf && !preview;

  // Library opens on Watchlists; warm Favorites so its tab opens loaded.
  const username = overview.profile.username;
  useEffect(() => {
    const { key, fetcher } = favoritesLoad(username, preview);
    prefetch(key, fetcher).catch(() => {});
  }, [username, preview]);

  const counts: Record<Section, number | null> = {
    watchlists: overview.publicWatchlists.length,
    favorites: null,
    watched: overview.watchedHidden ? null : overview.profile.stats.watchedCount + watchedLocal.added - watchedLocal.removed.size,
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Pulled up against the primary tabs (the page spaces sections by gap-8). */}
      <div role="tablist" aria-label="Library" className="-mt-8 flex gap-5 border-b border-border/60 pt-3">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            id={`library-tab-${s.id}`}
            aria-selected={section === s.id}
            aria-controls={`library-panel-${s.id}`}
            onClick={() => {
              setSection(s.id);
              trackProfile(pid, 'section_opened', undefined, { section: `library_${s.id}` });
            }}
            className={cn(
              '-mb-px border-b py-2 text-xs font-semibold uppercase tracking-widest transition-colors cursor-pointer',
              section === s.id ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {s.label}
            {counts[s.id] ? <span className="ml-1.5 tabular-nums text-muted-foreground">{counts[s.id]}</span> : null}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`library-panel-${section}`} aria-labelledby={`library-tab-${section}`}>
        {section === 'watchlists' && <Watchlists showcase={showcase} />}
        {section === 'favorites' && <Favorites showcase={showcase} preview={preview} />}
        {section === 'watched' && (
          <WatchedTickets
            showcase={showcase}
            owner={owner}
            preview={preview}
            local={watchedLocal}
            onLocalChange={onWatchedLocalChange}
          />
        )}
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">{text}</p>;
}

// ---------------------------------------------------------------------------
// Watchlists
// ---------------------------------------------------------------------------

function Watchlists({ showcase }: { showcase: ProfileShowcase }) {
  const lists = showcase.overview.publicWatchlists;
  if (lists.length === 0) return <Empty text="No public watchlists yet." />;
  return (
    <ul className="grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
      {lists.map((l) => (
        <WatchlistCoverCard key={l.id} list={l} />
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Favorites: "All favorites" + shelves, loaded when the section opens
// ---------------------------------------------------------------------------

/** Cache key + loader for a profile's favorites, shared with the Library prefetch. */
export function favoritesLoad(username: string, preview: boolean) {
  return {
    key: `profile-favorites:${username}:${preview ? 'guest' : 'viewer'}`,
    fetcher: (): Promise<ProfileFavorites> => getProfileFavoritesAction(username, { asGuest: preview }),
  };
}

function Favorites({ showcase, preview }: { showcase: ProfileShowcase; preview: boolean }) {
  const username = showcase.overview.profile.username;
  const owner = showcase.overview.isSelf && !preview;
  const { key, fetcher } = favoritesLoad(username, preview);
  const { data, failed, retry } = useCachedLoad(key, fetcher);

  if (failed) {
    return (
      <p className="text-sm text-muted-foreground">
        Couldn&apos;t load favorites.{' '}
        <button type="button" onClick={retry} className="text-primary hover:underline cursor-pointer">
          Try again
        </button>
      </p>
    );
  }
  if (!data) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading favorites">
        {[0, 1].map((i) => (
          <div key={i} className="flex gap-4 p-3">
            <div className="h-36 w-10 rounded-sm bg-secondary animate-pulse" />
            <div className="flex gap-3">
              {[0, 1, 2, 3].map((j) => (
                <div key={j} className="aspect-2/3 w-24 rounded-sm bg-secondary animate-pulse" />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  const nothing = !data.all?.length && data.shelves.every((s) => s.items.length === 0);
  if (nothing) return <Empty text={data.all === null ? 'Favorites are private.' : 'No favorites yet.'} />;

  return (
    <div className="flex flex-col gap-2">
      {data.all && data.all.length > 0 && <ShelfRail label="All favorites" items={data.all} />}
      {data.shelves.map((shelf) => (
        <ShelfRail
          key={shelf.id}
          label={shelf.name}
          color={getAccent(shelf.color)?.primary ?? null}
          note={owner && !shelf.isPublic ? 'Private · only you see this shelf' : undefined}
          items={shelf.items}
        />
      ))}
      {owner && data.shelves.some((s) => !s.isPublic) && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Lock className="h-3 w-3" /> Make a shelf public from its menu on your Favorites page to show it here.
        </p>
      )}
    </div>
  );
}
