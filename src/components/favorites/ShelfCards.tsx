'use client';

import React, { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, ChevronLeft, ChevronRight, Library, Lock, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { buildImageUrl } from '@/lib/tmdb';
import { QuickViewLink } from '@/components/watchly/QuickViewLink';
import { useUIStore } from '@/client/stores/ui';
import { SHELF_NAME_MAX } from '@/services/favorites/validators';
import type { Folder, FoldersApi } from './useShelves';
import { EmptyResults, favImage, favKey, favName, favYear, type Fav } from './favoritesParts';
import { DRAG_TYPE, ShelfHeadingMenu, ShelfVisibilityToggle, type ShelfDialogs } from './shelfParts';

// Shelves as cards: the /favorites wide view (editable) and a profile's
// Library (read-only). Each card's top crossfades through the shelf's
// posters on its own, whole poster over a blurred, darkened copy, with the
// title. A click opens the shelf in place: the card grows into a panel two
// columns wide and two rows tall and the other cards reflow around it (dense
// grid, animated). Cards fade up one after another. When editable, a shelf's
// name renames inline, and each card is a drop target for shelving.

export interface ShelfCardData {
  id: string;
  name: string;
  /** Shelf colour (accent hex), or null for neutral. */
  color: string | null;
  items: Fav[];
  /** The stored shelf, when this viewer can change it. */
  folder?: Folder;
  /** A quiet line under the name (read-only cards), e.g. "Private · only you see this". */
  note?: string;
}

/** Everything the owner's Favorites page adds: changes, drops, shelf view. */
export interface ShelfCardsEdit {
  f: FoldersApi;
  d: ShelfDialogs;
  /** Leave wide view with this shelf open. */
  onOpenInShelfView: (folderId: string) => void;
  dropOver: string | null;
  dropProps: (id: string, name: string) => Pick<React.HTMLAttributes<HTMLElement>, 'onDragOver' | 'onDragLeave' | 'onDrop'>;
}

/** Posters a card's top cycles through, and how long each holds. */
const COVER_MAX = 8;
const COVER_HOLD_MS = 4500;
const CARD_STAGGER_S = 0.06;
/** Cards per page (three rows of three on desktop). */
const PAGE_SIZE = 9;

const titles = (n: number) => `${n} ${n === 1 ? 'title' : 'titles'}`;

const hrefOf = (fav: Fav) =>
  fav.type === 'artist' ? `/artist/${fav.favoriteId}` : fav.type === 'collection' ? `/collection/${fav.favoriteId}` : `/title/${fav.type}/${fav.favoriteId}`;

const kindOf = (fav: Fav) =>
  fav.type === 'movie' ? 'Film' : fav.type === 'tv' ? 'Series' : fav.type === 'collection' ? 'Collection' : 'Artist';

export function ShelfCards({
  shelves,
  edit,
  focusId,
  className,
}: {
  shelves: ShelfCardData[];
  edit?: ShelfCardsEdit;
  /** A shelf to show now (e.g. one just created): turns to its page and opens it. */
  focusId?: string | null;
  className?: string;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const reduceMotion = useReducedMotion();
  // A page of cards at a time. Clamped, so deleting shelves can't strand you on an empty page.
  const pages = Math.max(1, Math.ceil(shelves.length / PAGE_SIZE));
  const [rawPage, setPage] = useState(0);
  const page = Math.min(rawPage, pages - 1);
  // A new focus target turns to its page and opens it, once it's in the list.
  const [focused, setFocused] = useState<string | null>(null);
  if (focusId && focusId !== focused) {
    const at = shelves.findIndex((x) => x.id === focusId);
    if (at !== -1) {
      setFocused(focusId);
      setPage(Math.floor(at / PAGE_SIZE));
      setOpenId(focusId);
    }
  }
  const onPage = shelves.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const turn = (step: number) => {
    setOpenId(null);
    setPage(Math.min(Math.max(page + step, 0), pages - 1));
  };
  // Quick View opens over the page; Escape there shouldn't also close the panel.
  const quickViewOpen = useUIStore((s) => s.quickView !== null);

  useEffect(() => {
    if (!openId) return;
    const onKey = (e: KeyboardEvent) => {
      // Escape in the rename field cancels the rename, not the panel.
      if (e.key !== 'Escape' || quickViewOpen || (e.target instanceof Element && e.target.closest('input'))) return;
      setOpenId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openId, quickViewOpen]);

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {pages > 1 && (
        <nav aria-label="Shelf pages" className="flex items-center justify-end gap-1 text-xs text-muted-foreground">
          <PageButton label="Previous shelves" disabled={page === 0} onClick={() => turn(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </PageButton>
          <span className="min-w-12 text-center tabular-nums" aria-live="polite">
            {page + 1} / {pages}
          </span>
          <PageButton label="Next shelves" disabled={page === pages - 1} onClick={() => turn(1)}>
            <ChevronRight className="h-4 w-4" />
          </PageButton>
        </nav>
      )}
    {/* Fixed row height so a panel spanning two rows is always the same size,
        whether or not cards sit beside it; dense flow fills the gaps it leaves. */}
    <ul className="grid grid-flow-row-dense auto-rows-[15rem] grid-cols-2 gap-3 sm:auto-rows-[17rem] sm:gap-4 lg:grid-cols-3">
      {onPage.map((s, i) => {
        const open = s.id === openId;
        const editable = edit && s.folder ? { ...edit, folder: s.folder } : null;
        return (
          <motion.li
            key={s.id}
            layout={reduceMotion ? false : 'position'}
            initial={reduceMotion ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              opacity: { duration: 0.4, delay: i * CARD_STAGGER_S },
              y: { duration: 0.4, delay: i * CARD_STAGGER_S, ease: 'easeOut' },
              layout: { type: 'spring', stiffness: 380, damping: 36 },
            }}
            {...(editable ? editable.dropProps(s.id, s.name) : {})}
            className={cn(
              'group/card relative flex min-h-0 flex-col overflow-hidden rounded-lg border bg-card transition-colors',
              open && 'col-span-2 row-span-2',
              editable?.dropOver === s.id ? 'border-primary bg-primary-soft' : open ? 'border-foreground/25' : 'border-border hover:border-foreground/20',
            )}
          >
            {open ? (
              <ShelfPanel shelf={s} edit={editable} onClose={() => setOpenId(null)} />
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setOpenId(s.id)}
                  aria-expanded={false}
                  aria-label={`${s.name}, ${titles(s.items.length)}. Show what's on it`}
                  className="flex min-h-0 flex-1 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  <Cover shelf={s} index={i} />
                </button>
                <div className="flex min-w-0 items-center gap-2 border-t border-border px-3 pt-3">
                  <ColorDot color={s.color} />
                  {editable ? (
                    <InlineName folder={editable.folder} f={editable.f} className="text-sm font-semibold" />
                  ) : (
                    <span className="min-w-0 truncate text-sm font-semibold">{s.name}</span>
                  )}
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">{s.items.length}</span>
                </div>
                <div className="flex min-h-11 items-center gap-1.5 px-3 pb-3 pt-2 [&_button]:whitespace-nowrap">
                  {editable ? (
                    <>
                      <ShelfVisibilityToggle folder={editable.folder} f={editable.f} />
                      <ShelfHeadingMenu folder={editable.folder} d={editable.d} f={editable.f} />
                    </>
                  ) : (
                    s.note && (
                      <span className="inline-flex min-w-0 items-center gap-1.5 truncate text-xs text-muted-foreground">
                        <Lock className="h-3 w-3 shrink-0" /> {s.note}
                      </span>
                    )
                  )}
                </div>
              </>
            )}
          </motion.li>
        );
      })}
    </ul>
    </div>
  );
}

function PageButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-foreground transition-colors hover:bg-secondary disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
    </button>
  );
}

function ColorDot({ color }: { color: string | null }) {
  return (
    <span
      aria-hidden
      className={cn('h-2.5 w-2.5 shrink-0 rounded-full', !color && 'bg-muted-foreground/40')}
      style={color ? { background: color } : undefined}
    />
  );
}

/**
 * A shelf name you rename in place: click it, type, Enter (or click away) to
 * save, Escape to cancel. Blank or unchanged names are dropped.
 */
function InlineName({ folder, f, className, as = 'span' }: { folder: Folder; f: FoldersApi; className?: string; as?: 'span' | 'h3' }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(folder.name);
  const Heading = as;

  const save = () => {
    const name = draft.trim();
    if (name && name !== folder.name) f.renameFolder(folder.id, name);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        maxLength={SHELF_NAME_MAX}
        aria-label="Shelf name"
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            setDraft(folder.name);
            setEditing(false);
          }
        }}
        className={cn('min-w-0 flex-1 rounded-sm border border-border bg-background px-1.5 py-0.5 outline-none focus:border-primary', className)}
      />
    );
  }
  return (
    <Heading className="min-w-0 truncate">
      <button
        type="button"
        onClick={() => {
          setDraft(folder.name);
          setEditing(true);
        }}
        title="Rename shelf"
        className={cn(
          'max-w-full truncate rounded-sm text-left decoration-muted-foreground/50 underline-offset-4 hover:underline cursor-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          className,
        )}
      >
        {folder.name}
      </button>
    </Heading>
  );
}

/**
 * The card's top: the shelf's posters crossfading on their own, each whole
 * and sharp over a blurred, darkened copy of itself, with its title. Cards
 * start at different beats so a grid doesn't change in unison; still (first
 * poster only) when the viewer prefers reduced motion.
 */
function Cover({ shelf, index }: { shelf: ShelfCardData; index: number }) {
  const reduceMotion = useReducedMotion();
  const posters = shelf.items
    .slice(0, COVER_MAX)
    .map((fav) => ({ key: favKey(fav), title: favName(fav), src: buildImageUrl(favImage(fav), 'w342') }))
    .filter((p): p is { key: string; title: string; src: string } => !!p.src);
  const n = posters.length;
  const [at, setAt] = useState(0);

  useEffect(() => {
    if (reduceMotion || n < 2) return;
    let interval: ReturnType<typeof setInterval> | undefined;
    const start = setTimeout(() => {
      setAt((a) => (a + 1) % n);
      interval = setInterval(() => setAt((a) => (a + 1) % n), COVER_HOLD_MS);
    }, COVER_HOLD_MS + (index % 4) * 900);
    return () => {
      clearTimeout(start);
      if (interval) clearInterval(interval);
    };
  }, [reduceMotion, n, index]);

  const current = at % Math.max(n, 1);
  return (
    <span className="relative block min-h-0 w-full flex-1 overflow-hidden bg-secondary">
      {n === 0 ? (
        <span className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">Empty shelf</span>
      ) : (
        posters.map((p, i) => (
          <span
            key={p.key}
            className={cn(
              'absolute inset-0 transition-opacity duration-[1600ms] ease-in-out motion-reduce:transition-none',
              i === current ? 'opacity-100' : 'opacity-0',
            )}
          >
            <Image src={p.src} alt="" fill sizes="240px" className="scale-125 object-cover blur-xl brightness-[0.4]" />
            <span className="absolute inset-y-3 left-1/2 aspect-2/3 -translate-x-1/2 overflow-hidden rounded-md shadow-elevation-card">
              <Image src={p.src} alt="" fill sizes="160px" className="object-cover" />
            </span>
            <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/80 to-transparent px-3 pb-2 pt-8 text-left text-xs font-semibold text-white">
              {p.title}
            </span>
          </span>
        ))
      )}
      {/* The shelf's colour as a thin band, so cards still read by colour. */}
      {shelf.color && <span aria-hidden className="absolute inset-x-0 bottom-0 h-1" style={{ background: shelf.color }} />}
    </span>
  );
}

/** A shelf opened in place: everything on it, plus (when editable) its settings and a way into shelf view. */
function ShelfPanel({
  shelf,
  edit,
  onClose,
}: {
  shelf: ShelfCardData;
  edit: (ShelfCardsEdit & { folder: Folder }) | null;
  onClose: () => void;
}) {
  const { id, name, items, color } = shelf;
  const ref = useRef<HTMLDivElement>(null);
  // Bring the panel into view (it may have moved to a new row) and hand it focus.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const t = setTimeout(() => {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      el.focus({ preventScroll: true });
    }, 250);
    return () => clearTimeout(t);
  }, []);

  return (
    <div ref={ref} tabIndex={-1} role="region" aria-label={name} className="flex h-full min-h-0 flex-col outline-none">
      <header
        className="flex shrink-0 flex-col gap-2.5 border-b border-border px-4 pb-3 pt-4"
        style={{ background: color ? `color-mix(in srgb, ${color} 16%, transparent)` : undefined }}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <ColorDot color={color} />
          {edit ? (
            <InlineName as="h3" folder={edit.folder} f={edit.f} className="text-base font-bold tracking-tight" />
          ) : (
            <h3 className="min-w-0 truncate text-base font-bold tracking-tight">{name}</h3>
          )}
          <span className="shrink-0 text-xs text-muted-foreground">{titles(items.length)}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label={`Close ${name}`}
            className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {edit ? (
          <div className="flex flex-wrap items-center gap-2 [&_button]:whitespace-nowrap">
            <ShelfVisibilityToggle folder={edit.folder} f={edit.f} />
            <ShelfHeadingMenu folder={edit.folder} d={edit.d} f={edit.f} />
            <button
              type="button"
              onClick={() => {
                onClose();
                edit.onOpenInShelfView(id);
              }}
              className="ml-auto inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <Library className="h-3.5 w-3.5" /> Open in shelf view <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          shelf.note && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Lock className="h-3 w-3" /> {shelf.note}
            </p>
          )
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 [scrollbar-width:thin]">
        {items.length === 0 ? (
          <EmptyResults>
            {edit ? 'Nothing on this shelf yet. Drag a favorite onto it, or shelve one from a card’s ⋯ menu.' : 'Nothing on this shelf yet.'}
          </EmptyResults>
        ) : (
          <ul className="grid grid-cols-3 gap-x-3 gap-y-4 sm:grid-cols-4 xl:grid-cols-5">
            {items.map((fav) => {
              const img = buildImageUrl(favImage(fav), 'w185');
              const key = favKey(fav);
              const year = favYear(fav);
              return (
                <li
                  key={key}
                  draggable={!!edit}
                  onDragStart={(e) => {
                    e.dataTransfer.setData(DRAG_TYPE, key);
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                  className="group relative min-w-0"
                >
                  <QuickViewLink href={hrefOf(fav)} title={favName(fav)} className="block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <span className="relative block aspect-2/3 overflow-hidden rounded-md border border-border bg-muted">
                      {img && <Image src={img} alt="" fill sizes="(min-width:1024px) 120px, 30vw" className="object-cover" />}
                    </span>
                    <span className="mt-1.5 block truncate text-xs font-semibold">{favName(fav)}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {kindOf(fav)}
                      {year ? ` · ${year}` : ''}
                    </span>
                  </QuickViewLink>
                  {edit && (
                    <button
                      type="button"
                      onClick={() => edit.f.removeFromFolder(key, id)}
                      aria-label={`Take ${favName(fav)} off ${name}`}
                      className="absolute right-1 top-1 rounded-sm bg-background/90 px-1.5 py-0.5 text-[10px] text-foreground cursor-pointer [@media(hover:hover)]:hidden [@media(hover:hover)]:group-hover:block [@media(hover:hover)]:group-focus-within:block"
                    >
                      Take off
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
