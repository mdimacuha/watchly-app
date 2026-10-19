'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import Link from 'next/link';
import { Anton } from 'next/font/google';
import { formatRelativeAgo } from '@/lib/format';
import type { WatchlistWithCount } from '@/services/watchlists';
import { ListMenu, RuntimePair, VisibilityIcon, listStats, sortLists, useListPrefs } from './watchlistsPageParts';
import { WIDE_MAX, WatchlistCoverCard, WatchlistsHeader, WideCascade, useScrub } from './WatchlistCoverCard';
import { CreateWatchlistModal } from './CreateWatchlistModal';
import { WatchlistsEmpty } from './WatchlistsEmpty';

// Spine labels and the list view's names are set in Anton.
const anton = Anton({ weight: '400', subsets: ['latin'], variable: '--font-anton' });

interface WatchlistsPageClientProps {
  watchlists: WatchlistWithCount[];
}

/**
 * /watchlists: stats header, then the owner's lists as scrubbable cover
 * cards (grid) or a numbered board (list) whose rows open on hover to show
 * the cascade. Holds the lists locally so menu actions (edit, visibility,
 * delete) show instantly.
 */
export function WatchlistsPageClient({ watchlists }: WatchlistsPageClientProps) {
  const [lists, setLists] = useState(watchlists);
  const [creating, setCreating] = useState(false);
  const { view, sort, setView, setSort } = useListPrefs('grid');
  const canHover = useHoverCapable();

  const sorted = sortLists(lists, sort);
  const onChanged = (next: WatchlistWithCount) => setLists((cur) => cur.map((l) => (l.id === next.id ? next : l)));
  const onDeleted = (id: string) => setLists((cur) => cur.filter((l) => l.id !== id));

  return (
    <div className={`${anton.variable} flex flex-col gap-8`}>
      <WatchlistsHeader
        stats={listStats(lists)}
        view={view}
        sort={sort}
        setView={setView}
        setSort={setSort}
        onCreate={() => setCreating(true)}
      />

      {sorted.length === 0 ? (
        <WatchlistsEmpty onCreate={() => setCreating(true)} />
      ) : view === 'grid' ? (
        <ul className="grid grid-cols-1 gap-x-8 gap-y-10 md:grid-cols-2 xl:grid-cols-3">
          {sorted.map((l) => (
            <WatchlistCoverCard key={l.id} list={l} onChanged={onChanged} onDeleted={onDeleted} />
          ))}
        </ul>
      ) : (
        <ol className="flex flex-col border-t border-border">
          {sorted.map((l, i) => (
            <BoardRow key={l.id} list={l} index={i} canHover={canHover} onChanged={onChanged} onDeleted={onDeleted} />
          ))}
        </ol>
      )}

      <CreateWatchlistModal isOpen={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

/** True on devices with a real hover pointer (mouse / trackpad), checked after mount. */
function useHoverCapable(): boolean {
  const [can, setCan] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(hover: hover) and (pointer: fine)');
    // eslint-disable-next-line react-hooks/set-state-in-effect -- client-only capability
    setCan(mq.matches);
    const onChange = () => setCan(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return can;
}

// Hover intent: open only after the pointer rests on a row, so sweeping down
// the list doesn't open every row (each opening would push the next away).
const OPEN_DELAY_MS = 120;

/**
 * One row of the list view. On hover-capable devices the row expands from
 * the top and lays the list's posters across the full row width above its
 * name; moving across the open row scrubs through them.
 */
function BoardRow({
  list,
  index,
  canHover,
  onChanged,
  onDeleted,
}: {
  list: WatchlistWithCount;
  index: number;
  canHover: boolean;
  onChanged: (next: WatchlistWithCount) => void;
  onDeleted: (id: string) => void;
}) {
  // Wheel + pointer scrub act on the posters only (WideCascade binds them).
  const { view, handlers, seek, wheelRef } = useScrub(list, { limit: WIDE_MAX, wheel: true });
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return (
    <li
      className="border-b border-border"
      onPointerEnter={() => {
        if (!canHover) return;
        handlers.onPointerEnter();
        timer.current = setTimeout(() => setOpen(true), OPEN_DELAY_MS);
      }}
      onPointerLeave={() => {
        if (timer.current) clearTimeout(timer.current);
        handlers.onPointerLeave();
        setOpen(false);
      }}
    >
      {/* Expands from the top: grid-rows 0fr → 1fr animates to the content's height. */}
      <div
        aria-hidden
        className={cn(
          'grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none',
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        )}
      >
        <div className="overflow-hidden">
          <div className="pb-4 pl-12 pr-2 pt-5">
            {canHover && <WideCascade list={list} s={view} revealed={open} seek={seek} wheelRef={wheelRef} />}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4 py-4">
        <span className="w-8 font-mono text-xs tabular-nums text-muted-foreground">{String(index + 1).padStart(2, '0')}</span>
        <Link href={`/watchlists/${list.id}`} className="flex min-w-0 flex-1 items-center gap-6 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span className="type-display truncate text-3xl text-foreground md:text-4xl">{list.name}</span>
          <span className="ml-auto hidden items-center gap-6 type-kicker text-muted-foreground md:flex">
            <span><span className="text-foreground">{list.itemCount}</span> titles</span>
            <span><span className="text-foreground">{list.finishedCount ?? 0}</span> watched</span>
            <RuntimePair list={list} />
            <span className="flex items-center gap-1.5"><VisibilityIcon isPublic={list.isPublic} />{list.isPublic ? 'Public' : 'Private'}</span>
            <span>{formatRelativeAgo(list.lastActivityAt ?? list.updatedAt)}</span>
          </span>
        </Link>
        <ListMenu list={list} onChanged={onChanged} onDeleted={onDeleted} />
      </div>
    </li>
  );
}
