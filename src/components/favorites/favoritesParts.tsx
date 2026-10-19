'use client';

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { Check, MoreHorizontal, Search, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { buildImageUrl } from '@/lib/tmdb';
import { useToast } from '@/hooks/useToast';
import { useAuthStore } from '@/client/stores/auth';
import { AccentScope } from '@/components/profile/AccentScope';
import { toggleFavoriteAction } from '@/actions/favorites';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/button';
import { QuickViewLink } from '@/components/watchly/QuickViewLink';
import type { EnrichedFavorite } from '@/services/favorites/enrich';
import { SHELF_NAME_MAX } from '@/services/favorites/validators';

// Pieces of the /favorites page: data helpers, search/filter/sort state,
// header, toolbar, card, menu and dialogs.

export type Fav = EnrichedFavorite;
export type TypeFilter = 'all' | Fav['type'];
export type FavSort = 'recent' | 'alpha' | 'year' | 'rating';

export const favKey = (f: Fav) => `${f.type}:${f.favoriteId}`;
export const favName = (f: Fav) => (f.type === 'movie' ? f.data.title : f.data.name);
export const favYear = (f: Fav): number | null => {
  const d = f.type === 'movie' ? f.data.releaseDate : f.type === 'tv' ? f.data.firstAirDate : null;
  return d ? Number(d.slice(0, 4)) || null : null;
};
export const favRating = (f: Fav): number | null =>
  f.type === 'movie' || f.type === 'tv' ? f.data.voteAverage || null : null;
export const favImage = (f: Fav) => (f.type === 'artist' ? f.data.profilePath : f.data.posterPath);

const TYPE_LABEL: Record<Fav['type'], string> = { movie: 'Film', tv: 'Series', collection: 'Collection', artist: 'Artist' };

/** Local favorites list with search / type / sort and optimistic remove. */
export function useFavoritesView(favorites: Fav[], onForget: (key: string) => void) {
  const [list, setList] = useState(favorites);
  const [query, setQuery] = useState('');
  const [type, setType] = useState<TypeFilter>('all');
  const [sort, setSort] = useState<FavSort>('recent');
  const toast = useToast();

  const filter = (items: Fav[]) => {
    const q = query.trim().toLowerCase();
    const out = items.filter((f) => (type === 'all' || f.type === type) && (!q || favName(f).toLowerCase().includes(q)));
    switch (sort) {
      case 'alpha':
        return out.sort((a, b) => favName(a).localeCompare(favName(b)));
      case 'year':
        return out.sort((a, b) => (favYear(b) ?? 0) - (favYear(a) ?? 0));
      case 'rating':
        return out.sort((a, b) => (favRating(b) ?? 0) - (favRating(a) ?? 0));
      default:
        return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
  };

  const remove = async (f: Fav) => {
    const prev = list;
    setList((cur) => cur.filter((x) => favKey(x) !== favKey(f)));
    try {
      await toggleFavoriteAction(f.favoriteId, f.type, true, '/favorites');
      onForget(favKey(f));
      toast.success('Removed from favorites', favName(f));
    } catch {
      setList(prev);
      toast.error('Could not remove', 'Please try again.');
    }
  };

  /** Bulk remove: one optimistic update and one toast; failures are put back. */
  const removeMany = async (favs: Fav[]) => {
    if (favs.length === 0) return;
    const keys = new Set(favs.map(favKey));
    setList((cur) => cur.filter((x) => !keys.has(favKey(x))));
    const results = await Promise.allSettled(
      favs.map((f) => toggleFavoriteAction(f.favoriteId, f.type, true, '/favorites')),
    );
    const failed = favs.filter((_, i) => results[i].status === 'rejected');
    favs.filter((_, i) => results[i].status === 'fulfilled').forEach((f) => onForget(favKey(f)));
    if (failed.length) {
      setList((cur) => [...cur, ...failed]);
      toast.error(`Couldn’t remove ${failed.length}`, 'Please try again.');
    }
    const done = favs.length - failed.length;
    if (done) toast.success(`Removed ${done} from favorites`);
  };

  const byKey = useMemo(() => new Map(list.map((f) => [favKey(f), f])), [list]);
  return { list, byKey, query, setQuery, type, setType, sort, setSort, filter, remove, removeMany };
}

export type FavView = ReturnType<typeof useFavoritesView>;

/** Title + stats band (same structure as /watchlists). */
export function FavHeader({ list, folderCount, folderNoun, action }: { list: Fav[]; folderCount: number; folderNoun: string; action?: React.ReactNode }) {
  const count = (t: Fav['type']) => list.filter((f) => f.type === t).length;
  return (
    <header className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-h2">Favorites</h1>
          <p className="text-sm text-muted-foreground">
            The things you love, kept for good · {folderCount} {folderCount === 1 ? folderNoun : `${folderNoun}s`}
          </p>
        </div>
        {action}
      </div>
      <dl className="grid grid-cols-2 border-y border-border md:grid-cols-4 md:divide-x md:divide-border">
        <Stat label="Favorites" value={list.length} />
        <Stat label="Films" value={count('movie')} />
        <Stat label="Series" value={count('tv')} />
        <Stat label="Artists & collections" value={count('artist') + count('collection')} />
      </dl>
    </header>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-1 py-4 md:px-5 md:first:pl-0">
      <dt className="type-kicker text-muted-foreground">{label}</dt>
      <dd className="text-3xl font-bold tabular-nums text-foreground">{value}</dd>
    </div>
  );
}

const TYPES: { id: TypeFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'movie', label: 'Films' },
  { id: 'tv', label: 'Series' },
  { id: 'collection', label: 'Collections' },
  { id: 'artist', label: 'Artists' },
];

/** Search + type filter + sort, with a slot for variant actions. */
export function FavToolbar({ v, children }: { v: FavView; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
      <label className="relative lg:w-64">
        <span className="sr-only">Search favorites</span>
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={v.query}
          onChange={(e) => v.setQuery(e.target.value)}
          placeholder="Search favorites"
          className="h-9 w-full rounded-md border border-border bg-card pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </label>
      <div role="radiogroup" aria-label="Type" className="flex flex-wrap gap-1">
        {TYPES.map((t) => (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={v.type === t.id}
            onClick={() => v.setType(t.id)}
            className={cn(
              'h-9 rounded-md px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              v.type === t.id ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 lg:ml-auto">
        <label className="sr-only" htmlFor="fav-sort">Sort</label>
        <select
          id="fav-sort"
          value={v.sort}
          onChange={(e) => v.setSort(e.target.value as FavSort)}
          className="h-9 rounded-md border border-border bg-card px-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="recent">Recently loved</option>
          <option value="alpha">Name A–Z</option>
          <option value="year">Newest release</option>
          <option value="rating">Highest rated</option>
        </select>
        {children}
      </div>
    </div>
  );
}

/**
 * One favorite. `typed` gives artists a square portrait and collections a
 * box-set of slivers so mixed folders read by shape; `uniform` keeps 2:3.
 */
export function FavCard({
  fav,
  shape = 'uniform',
  selecting,
  selected,
  onToggleSelect,
  menu,
  footer,
  liProps,
}: {
  fav: Fav;
  shape?: 'uniform' | 'typed';
  selecting?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  menu?: React.ReactNode;
  footer?: React.ReactNode;
  /** Extra props for the <li> (e.g. draggable + onDragStart). */
  liProps?: React.LiHTMLAttributes<HTMLLIElement>;
}) {
  const img = buildImageUrl(favImage(fav), 'w342');
  const name = favName(fav);
  const year = favYear(fav);
  const aspect = shape === 'typed' && fav.type === 'artist' ? 'aspect-square rounded-full' : 'aspect-2/3 rounded-sm';
  const art = (
    <div className={cn('relative w-full overflow-hidden border border-border bg-card', aspect, selected && 'ring-2 ring-primary')}>
      {img ? (
        <Image src={img} alt="" fill sizes="(max-width: 640px) 45vw, 200px" className="object-cover" />
      ) : (
        <span className="absolute inset-0 flex items-end p-2 text-sm font-semibold text-muted-foreground">{name}</span>
      )}
      {shape === 'typed' && fav.type === 'collection' && (
        <span aria-hidden className="absolute inset-y-0 right-0 flex w-3 flex-col gap-px bg-background/80">
          {[0, 1, 2].map((i) => <span key={i} className="flex-1 bg-secondary" />)}
        </span>
      )}
    </div>
  );

  // Titles and artists open Quick View; collections are a plain link.
  const href =
    fav.type === 'artist'
      ? `/artist/${fav.favoriteId}`
      : fav.type === 'collection'
        ? `/collection/${fav.favoriteId}`
        : `/title/${fav.type}/${fav.favoriteId}`;

  const meta = (
    <div className="mt-2 min-w-0">
      <p className="truncate text-sm font-semibold text-foreground">{name}</p>
      <p className="truncate text-xs text-muted-foreground">
        {[TYPE_LABEL[fav.type], year].filter(Boolean).join(' · ')}
      </p>
      {footer}
    </div>
  );

  return (
    <li className="group relative flex flex-col" {...liProps}>
      {selecting ? (
        <button type="button" onClick={onToggleSelect} aria-pressed={selected} className="text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm">
          <span className="relative block">
            {art}
            <span className={cn('absolute left-2 top-2 flex h-5 w-5 items-center justify-center rounded-sm border', selected ? 'border-primary bg-primary text-primary-foreground' : 'border-foreground/60 bg-background/70')}>
              {selected && <Check className="h-3.5 w-3.5" />}
            </span>
          </span>
          {meta}
        </button>
      ) : (
        <>
          {/* Poster and text are both links; the poster one is skipped by
              keyboard/screen readers so each card is one tab stop. */}
          <QuickViewLink href={href} tabIndex={-1} aria-hidden className="block">
            {art}
          </QuickViewLink>
          {/* The ⋯ sits in the name row (a sibling of the link, never inside
              it), so it lines up with the name whatever the card type. */}
          <div className="flex items-start gap-1">
            <QuickViewLink
              href={href}
              className="min-w-0 flex-1 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {meta}
            </QuickViewLink>
            {menu && <div className="mt-1.5 shrink-0">{menu}</div>}
          </div>
        </>
      )}
    </li>
  );
}

const MENU_W = 224; // w-56
const EDGE = 8;

/**
 * Tiny ⋯ dropdown; children are menu rows. Rendered in a portal with fixed
 * positioning so it's never clipped by a card or slid under the app
 * sidebar: kept inside the viewport and flipped upward when there's no room
 * below. Closes on outside click, Esc, scroll or resize.
 */
export function Menu({ label, children, align = 'right' }: { label: string; children: (close: () => void) => React.ReactNode; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const accentColor = useAuthStore((s) => s.user?.accentColor ?? null);

  // Measure after the menu renders (its height decides up vs down).
  useLayoutEffect(() => {
    if (!open || !btnRef.current || !menuRef.current) return;
    const b = btnRef.current.getBoundingClientRect();
    const h = menuRef.current.offsetHeight;
    const rawLeft = align === 'right' ? b.right - MENU_W : b.left;
    const left = Math.min(Math.max(rawLeft, EDGE), window.innerWidth - MENU_W - EDGE);
    const below = b.bottom + 4;
    const top = below + h > window.innerHeight - EDGE ? Math.max(b.top - 4 - h, EDGE) : below;
    setPos({ top, left });
  }, [open, align]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!btnRef.current?.contains(t) && !menuRef.current?.contains(t)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close();
        btnRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={() => {
          setPos(null);
          setOpen((o) => !o);
        }}
        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open &&
        createPortal(
          <AccentScope accentColor={accentColor}>
            <div
              ref={menuRef}
              role="menu"
              aria-label={label}
              className="fixed z-[70] w-56 rounded-md border border-border bg-card py-1 shadow-elevation-card"
              // Hidden for the one frame before it's measured.
              style={pos ? { top: pos.top, left: pos.left } : { top: 0, left: 0, visibility: 'hidden' }}
            >
              {children(() => setOpen(false))}
            </div>
          </AccentScope>,
          document.body,
        )}
    </>
  );
}

export const menuItem =
  'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-foreground hover:bg-secondary focus:bg-secondary focus:outline-none';

/** Name prompt for new / renamed folders. */
export function NameDialog({
  open,
  title,
  initial = '',
  submitLabel,
  onClose,
  onSubmit,
}: {
  open: boolean;
  title: string;
  initial?: string;
  submitLabel: string;
  onClose: () => void;
  onSubmit: (name: string) => void;
}) {
  return (
    <Modal isOpen={open} onClose={onClose} className="max-w-sm">
      {open && <NameForm title={title} initial={initial} submitLabel={submitLabel} onClose={onClose} onSubmit={onSubmit} />}
    </Modal>
  );
}

function NameForm({ title, initial, submitLabel, onClose, onSubmit }: { title: string; initial: string; submitLabel: string; onClose: () => void; onSubmit: (name: string) => void }) {
  const [name, setName] = useState(initial);
  return (
    <form
      className="flex flex-col gap-4 p-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        onSubmit(name.trim());
        onClose();
      }}
    >
      <h2 className="pr-8 text-lg font-bold text-foreground">{title}</h2>
      <input
        autoFocus
        value={name}
        maxLength={SHELF_NAME_MAX}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Comfort rewatches"
        className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={!name.trim()}>{submitLabel}</Button>
      </div>
    </form>
  );
}

export function EmptyResults({ children }: { children: React.ReactNode }) {
  return <p className="rounded-md border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">{children}</p>;
}

export { X };
