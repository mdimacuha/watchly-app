'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { Lock } from 'lucide-react';
import { cn } from '@/lib/cn';
import { buildImageUrl } from '@/lib/tmdb';
import { getAccent } from '@/constants/accentColors';
import { QuickViewLink } from '@/components/watchly/QuickViewLink';
import { WatchlistCoverCard } from '@/components/watchlists/WatchlistCoverCard';
import { ShelfRail } from '@/components/favorites/shelfParts';
import { trackProfile } from '@/client/profileEvents';
import { getProfileFavoritesAction, type ProfileShowcase } from '@/actions/profile';
import { prefetch, useCachedLoad } from '@/client/cachedLoad';
import type { ProfileFavorites } from '@/services/favorites/profileShelves';
import type { EnrichedWatched } from '@/services/watched';

// The profile's Library: Watchlists · Favorites · Watched as sub-tabs.
// Watchlists reuse the list page's cover cards (read-only), favorites are
// shelves as spined rails, and watched titles are an archive of ticket stubs.

type Section = 'watchlists' | 'favorites' | 'watched';
const SECTIONS: { id: Section; label: string }[] = [
  { id: 'watchlists', label: 'Watchlists' },
  { id: 'favorites', label: 'Favorites' },
  { id: 'watched', label: 'Watched' },
];

export function ProfileLibrary({ showcase, preview }: { showcase: ProfileShowcase; preview: boolean }) {
  const [section, setSection] = useState<Section>('watchlists');
  const { overview } = showcase;
  const pid = overview.profile.userId;

  // Library opens on Watchlists; warm Favorites so its tab opens loaded.
  const username = overview.profile.username;
  useEffect(() => {
    const { key, fetcher } = favoritesLoad(username, preview);
    prefetch(key, fetcher).catch(() => {});
  }, [username, preview]);

  const counts: Record<Section, number | null> = {
    watchlists: overview.publicWatchlists.length,
    favorites: null,
    watched: overview.watchedHidden ? null : overview.profile.stats.watchedCount,
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
        {section === 'watched' && <Watched showcase={showcase} />}
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

// ---------------------------------------------------------------------------
// Watched: ticket stubs, newest first, grouped by month
// ---------------------------------------------------------------------------

const monthLabel = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
const stubDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();

function Watched({ showcase }: { showcase: ProfileShowcase }) {
  const { overview } = showcase;
  const total = overview.profile.stats.watchedCount;
  const groups = useMemo(() => {
    const sorted = [...overview.watchedTitles].sort((a, b) => b.watchedAt.localeCompare(a.watchedAt));
    const out: { month: string; items: { w: EnrichedWatched; serial: number }[] }[] = [];
    sorted.forEach((w, i) => {
      const month = monthLabel(w.watchedAt);
      const last = out[out.length - 1];
      // Ticket numbers count up through the whole history: newest = total.
      const entry = { w, serial: total - i };
      if (last?.month === month) last.items.push(entry);
      else out.push({ month, items: [entry] });
    });
    return out;
  }, [overview.watchedTitles, total]);

  if (overview.watchedHidden) return <Empty text="Watched list is private." />;
  if (overview.watchedTitles.length === 0) return <Empty text="Nothing marked watched yet." />;

  return (
    <div className="flex flex-col gap-8">
      {groups.map((g) => (
        <section key={g.month} aria-label={g.month}>
          <h3 className="mb-3 flex items-baseline gap-2">
            <span className="type-kicker text-foreground">{g.month}</span>
            <span className="text-xs tabular-nums text-muted-foreground">
              {g.items.length} {g.items.length === 1 ? 'ticket' : 'tickets'}
            </span>
          </h3>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {g.items.map(({ w, serial }) => (
              <TicketStub key={`${w.mediaType}:${w.mediaId}`} w={w} serial={serial} />
            ))}
          </ul>
        </section>
      ))}
      {overview.watchedTitles.length < total && (
        <p className="text-center text-xs text-muted-foreground">
          Showing the latest {overview.watchedTitles.length} of {total} tickets.
        </p>
      )}
    </div>
  );
}

/**
 * One stub: poster on the torn-off side, a perforated fold, then the ticket
 * face (serial, title, format/year, the date it was seen).
 */
function TicketStub({ w, serial }: { w: EnrichedWatched; serial: number }) {
  const title = w.mediaType === 'movie' ? w.data.title : w.data.name;
  const date = w.mediaType === 'movie' ? w.data.releaseDate : w.data.firstAirDate;
  const year = date ? date.slice(0, 4) : null;
  const poster = buildImageUrl(w.data.posterPath, 'w185');
  return (
    <li>
      <QuickViewLink
        mediaType={w.mediaType}
        titleId={w.mediaId}
        className="group relative flex h-28 overflow-hidden rounded-lg border border-border bg-card transition-colors hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="relative w-[4.5rem] shrink-0 bg-muted">
          {poster && <Image src={poster} alt="" fill sizes="72px" className="object-cover" />}
        </span>
        {/* The fold: notches punched top and bottom, a perforated line between. */}
        <span aria-hidden className="relative w-0">
          <span className="absolute -left-2 -top-2 h-4 w-4 rounded-full border border-border bg-background" />
          <span className="absolute -bottom-2 -left-2 h-4 w-4 rounded-full border border-border bg-background" />
          <span className="absolute inset-y-3 left-0 border-l border-dashed border-border" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col justify-between px-4 py-3">
          <span className="flex items-center justify-between gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            <span>{w.mediaType === 'movie' ? 'Film' : 'Series'}{year ? ` · ${year}` : ''}</span>
            <span className="tabular-nums">No. {String(Math.max(serial, 1)).padStart(4, '0')}</span>
          </span>
          <span className="line-clamp-2 text-sm font-semibold leading-snug text-foreground group-hover:text-primary">{title}</span>
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Seen <span className="text-foreground">{stubDate(w.watchedAt)}</span>
          </span>
        </span>
      </QuickViewLink>
    </li>
  );
}
