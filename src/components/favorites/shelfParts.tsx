'use client';

import React, { useEffect, useState } from 'react';
import { Check, Globe, HeartOff, Lock, Pencil, Plus, Trash2, Undo2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { ACCENTS, ACCENT_SLUGS, getAccent } from '@/constants/accentColors';
import { ConfirmDestructiveModal } from '@/components/ui/ConfirmDestructiveModal';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/useToast';
import type { Folder, FoldersApi } from './useShelves';
import { EmptyResults, FavCard, Menu, NameDialog, favKey, favRating, favYear, menuItem, type Fav, type FavView } from './favoritesParts';

// Shelf pieces of the /favorites page. Shelves are many-per-favorite;
// state + persistence live in useShelves.

export const DRAG_TYPE = 'application/x-watchly-favorite';

/** New / rename / delete dialogs for shelves, opened imperatively. */
export function useShelfDialogs(f: FoldersApi, opts: { onCreated?: (id: string) => void; onDeleted?: () => void } = {}) {
  const [naming, setNaming] = useState<null | { mode: 'new'; keys: string[] } | { mode: 'rename'; folder: Folder }>(null);
  const [deleting, setDeleting] = useState<Folder | null>(null);

  const dialogs = (
    <>
      <NameDialog
        open={!!naming}
        title={naming?.mode === 'rename' ? 'Rename shelf' : 'New shelf'}
        initial={naming?.mode === 'rename' ? naming.folder.name : ''}
        submitLabel={naming?.mode === 'rename' ? 'Save' : naming && naming.keys.length ? `Create with ${naming.keys.length}` : 'Create'}
        onClose={() => setNaming(null)}
        onSubmit={(name) => {
          if (naming?.mode === 'rename') f.renameFolder(naming.folder.id, name);
          else if (naming) opts.onCreated?.(f.createFolder(name, naming.keys));
        }}
      />
      <ConfirmDestructiveModal
        isOpen={!!deleting}
        onClose={() => setDeleting(null)}
        title={`Delete "${deleting?.name}"?`}
        description="The shelf goes away; everything on it stays in your favorites."
        confirmLabel="Delete shelf"
        onConfirm={async () => {
          if (deleting) f.deleteFolder(deleting.id);
          opts.onDeleted?.();
        }}
      />
    </>
  );

  return {
    newShelf: (keys: string[] = []) => setNaming({ mode: 'new', keys }),
    renameShelf: (folder: Folder) => setNaming({ mode: 'rename', folder }),
    deleteShelf: (folder: Folder) => setDeleting(folder),
    dialogs,
  };
}

export type ShelfDialogs = ReturnType<typeof useShelfDialogs>;

/** Spine colour for a shelf (accent palette), or null for neutral. */
export const shelfColor = (folder: Folder | undefined | null): string | null =>
  getAccent(folder?.color ?? null)?.primary ?? null;

/**
 * Public / private switch for a shelf. Public shelves show on your profile,
 * even when your favorites are hidden.
 */
export function ShelfVisibilityToggle({ folder, f }: { folder: Folder; f: FoldersApi }) {
  const Icon = folder.isPublic ? Globe : Lock;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={folder.isPublic}
      onClick={() => f.setFolderPublic(folder.id, !folder.isPublic)}
      title={folder.isPublic ? 'Shown on your profile. Click to make private.' : 'Only you can see this shelf. Click to show it on your profile.'}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        folder.isPublic ? 'border-primary/50 bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:text-foreground',
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {folder.isPublic ? 'On your profile' : 'Private'}
    </button>
  );
}

/** Rename / colour / visibility / delete menu for a shelf heading. */
export function ShelfHeadingMenu({ folder, d, f }: { folder: Folder; d: ShelfDialogs; f: FoldersApi }) {
  return (
    <Menu label={`${folder.name} actions`} align="left">
      {(close) => (
        <>
          <p className="px-3 pb-1.5 pt-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Spine colour</p>
          <div className="flex flex-wrap gap-1.5 px-3 pb-2" role="radiogroup" aria-label="Spine colour">
            <button
              type="button"
              role="radio"
              aria-checked={!folder.color}
              aria-label="No colour"
              onClick={() => f.setFolderColor(folder.id, null)}
              className={cn('h-6 w-6 rounded-sm border border-border bg-card', !folder.color && 'ring-2 ring-foreground ring-offset-1 ring-offset-card')}
            />
            {ACCENT_SLUGS.map((slug) => (
              <button
                key={slug}
                type="button"
                role="radio"
                aria-checked={folder.color === slug}
                aria-label={ACCENTS[slug].name}
                title={ACCENTS[slug].name}
                onClick={() => f.setFolderColor(folder.id, slug)}
                className={cn('h-6 w-6 rounded-sm', folder.color === slug && 'ring-2 ring-foreground ring-offset-1 ring-offset-card')}
                style={{ background: ACCENTS[slug].primary }}
              />
            ))}
          </div>
          <div className="my-1 border-t border-border" />
          <button className={menuItem} onClick={() => { close(); f.setFolderPublic(folder.id, !folder.isPublic); }}>
            {folder.isPublic ? <Lock className="h-4 w-4 text-muted-foreground" /> : <Globe className="h-4 w-4 text-muted-foreground" />}
            {folder.isPublic ? 'Make private' : 'Show on profile'}
          </button>
          <button className={menuItem} onClick={() => { close(); d.renameShelf(folder); }}>
            <Pencil className="h-4 w-4 text-muted-foreground" /> Rename
          </button>
          <button className={cn(menuItem, 'text-destructive')} onClick={() => { close(); d.deleteShelf(folder); }}>
            <Trash2 className="h-4 w-4" /> Delete shelf
          </button>
        </>
      )}
    </Menu>
  );
}

/** Card ⋯: shelf checklist, new shelf, take off this shelf, remove from favorites. */
export function ShelfCardMenu({
  fav,
  f,
  d,
  current,
  onRemove,
}: {
  fav: Fav;
  f: FoldersApi;
  d: ShelfDialogs;
  current?: Folder | null;
  onRemove: () => void;
}) {
  const key = favKey(fav);
  const mine = f.foldersOf(key);
  return (
    <Menu label="Favorite actions">
      {(close) => (
        <>
          <p className="px-3 pb-1 pt-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Shelves</p>
          {f.folders.map((folder) => {
            const on = mine.includes(folder.id);
            return (
              <button
                key={folder.id}
                role="menuitemcheckbox"
                aria-checked={on}
                className={menuItem}
                onClick={() => f.setItemFolders(key, on ? mine.filter((x) => x !== folder.id) : [...mine, folder.id])}
              >
                <span className={cn('flex h-4 w-4 items-center justify-center rounded-sm border', on ? 'border-primary bg-primary text-primary-foreground' : 'border-border')}>
                  {on && <Check className="h-3 w-3" />}
                </span>
                {folder.name}
              </button>
            );
          })}
          <button className={menuItem} onClick={() => { close(); d.newShelf([key]); }}>
            <Plus className="h-4 w-4 text-muted-foreground" /> New shelf…
          </button>
          {current && mine.includes(current.id) && (
            <button className={menuItem} onClick={() => { close(); f.removeFromFolder(key, current.id); }}>
              <Undo2 className="h-4 w-4 text-muted-foreground" /> Take off {current.name}
            </button>
          )}
          <div className="my-1 border-t border-border" />
          <button className={cn(menuItem, 'text-destructive')} onClick={() => { close(); onRemove(); }}>
            <HeartOff className="h-4 w-4" /> Remove from favorites
          </button>
        </>
      )}
    </Menu>
  );
}

/** The retained grid: uniform 2:3 cards, shelf names under, ⋯ menu; optional select / drag. */
export function ShelfGrid({
  items,
  v,
  f,
  d,
  current,
  empty,
  draggable,
  selecting,
  selected,
  onToggle,
}: {
  items: Fav[];
  v: FavView;
  f: FoldersApi;
  d: ShelfDialogs;
  current?: Folder | null;
  empty: React.ReactNode;
  draggable?: boolean;
  selecting?: boolean;
  selected?: string[];
  onToggle?: (key: string) => void;
}) {
  const nameOf = (id: string) => f.folders.find((x) => x.id === id)?.name ?? '';
  if (items.length === 0) return <EmptyResults>{empty}</EmptyResults>;
  return (
    <ul className="grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {items.map((fav) => {
        const key = favKey(fav);
        const shelves = f.foldersOf(key);
        return (
          <FavCard
            key={key}
            fav={fav}
            selecting={selecting}
            selected={selected?.includes(key)}
            onToggleSelect={() => onToggle?.(key)}
            liProps={
              draggable
                ? {
                    draggable: true,
                    onDragStart: (e) => {
                      e.dataTransfer.setData(DRAG_TYPE, key);
                      e.dataTransfer.effectAllowed = 'copy';
                    },
                  }
                : undefined
            }
            footer={
              shelves.length > 0 && (
                <p className="mt-1 flex min-w-0 items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  {shelves.slice(0, 2).map((id) => {
                    const color = shelfColor(f.folders.find((x) => x.id === id));
                    return (
                      <span key={id} className="flex min-w-0 items-center gap-1">
                        {color && <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-[1px]" style={{ background: color }} />}
                        <span className="truncate">{nameOf(id)}</span>
                      </span>
                    );
                  })}
                  {shelves.length > 2 && <span className="shrink-0">+{shelves.length - 2}</span>}
                </p>
              )
            }
            menu={<ShelfCardMenu fav={fav} f={f} d={d} current={current} onRemove={() => void v.remove(fav)} />}
          />
        );
      })}
    </ul>
  );
}

/** Drop handlers that add the dragged favorite to `folderId`. */
export function useShelfDrop(f: FoldersApi) {
  const [over, setOver] = useState<string | null>(null);
  const toast = useToast();
  const props = (folderId: string, name: string) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
      e.preventDefault();
      setOver(folderId);
    },
    onDragLeave: () => setOver(null),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setOver(null);
      const key = e.dataTransfer.getData(DRAG_TYPE);
      if (!key) return;
      f.addItems([key], folderId);
      toast.success(`On ${name}`);
    },
  });
  return { over, props };
}

export interface Suggestion {
  name: string;
  items: Fav[];
}

/** Shelf ideas from data we already have: decades, high ratings, types. */
export function suggestShelves(list: Fav[], taken: string[]): Suggestion[] {
  const out: Suggestion[] = [];
  const titles = list.filter((x) => x.type === 'movie' || x.type === 'tv');
  const byDecade = new Map<number, Fav[]>();
  for (const x of titles) {
    const y = favYear(x);
    if (!y) continue;
    const dec = Math.floor(y / 10) * 10;
    byDecade.set(dec, [...(byDecade.get(dec) ?? []), x]);
  }
  for (const [dec, items] of [...byDecade].sort((a, b) => b[1].length - a[1].length)) out.push({ name: `${dec}s favorites`, items });
  out.push({ name: 'Rated 8 and up', items: titles.filter((x) => (favRating(x) ?? 0) >= 8) });
  out.push({ name: 'Series I love', items: list.filter((x) => x.type === 'tv') });
  out.push({ name: 'People', items: list.filter((x) => x.type === 'artist') });
  out.push({ name: 'Box sets', items: list.filter((x) => x.type === 'collection') });
  const lower = taken.map((t) => t.toLowerCase());
  return out.filter((s) => s.items.length >= 2 && !lower.includes(s.name.toLowerCase())).slice(0, 6);
}

/**
 * Sticky bar for Select mode. What it offers depends on where you are:
 * - in "All" (no `shelf`): add the selection to shelves, or remove it from favorites
 * - inside a user shelf: take the selection off that shelf, or remove it from favorites
 * Removing from favorites asks first; taking off a shelf doesn't (nothing is lost).
 */
export function BulkBar({
  keys,
  folders,
  shelf,
  onApply,
  onNew,
  onTakeOff,
  onRemove,
  onCancel,
}: {
  keys: string[];
  folders: Folder[];
  /** The open user shelf, or null/undefined for "All". */
  shelf?: Folder | null;
  onApply: (ids: string[]) => void;
  onNew: () => void;
  onTakeOff?: () => void;
  /** Remove the selection from favorites (confirmed here first). */
  onRemove?: () => void;
  onCancel: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const toast = useToast();
  const none = keys.length === 0;

  const removeButton = onRemove && (
    <button
      type="button"
      disabled={none}
      onClick={() => setConfirming(true)}
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-destructive disabled:opacity-50"
    >
      <HeartOff className="h-4 w-4" /> Remove from favorites
    </button>
  );

  return (
    <div className="sticky bottom-4 z-30 mx-auto flex w-full max-w-3xl flex-col gap-3 rounded-md border border-border bg-card px-4 py-3 shadow-elevation-card">
      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold text-foreground">{keys.length} selected</span>
        {!shelf && <span className="text-xs text-muted-foreground">Add to shelves:</span>}
        <Button variant="ghost" onClick={onCancel} className="ml-auto h-8">Cancel</Button>
      </div>

      {shelf ? (
        <div className="flex flex-wrap items-center gap-4">
          <Button
            variant="secondary"
            disabled={none}
            onClick={() => {
              onTakeOff?.();
              toast.success(`Took ${keys.length} off ${shelf.name}`, 'They’re still in your favorites.');
            }}
            className="h-8 gap-2"
          >
            <Undo2 className="h-4 w-4" /> Take off {shelf.name}
          </Button>
          {removeButton}
        </div>
      ) : (
        <AddToShelves keys={keys} folders={folders} onApply={onApply} onNew={onNew} extra={removeButton} />
      )}

      <ConfirmDestructiveModal
        isOpen={confirming}
        onClose={() => setConfirming(false)}
        title={`Remove ${keys.length} from favorites?`}
        description="They also come off every shelf they’re on."
        confirmLabel="Remove"
        onConfirm={async () => {
          onRemove?.();
        }}
      />
    </div>
  );
}

function AddToShelves({
  keys,
  folders,
  onApply,
  onNew,
  extra,
}: {
  keys: string[];
  folders: Folder[];
  onApply: (ids: string[]) => void;
  onNew: () => void;
  extra?: React.ReactNode;
}) {
  const [picks, setPicks] = useState<string[]>([]);
  const toast = useToast();
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5">
        {folders.map((folder) => {
          const on = picks.includes(folder.id);
          return (
            <button
              key={folder.id}
              type="button"
              role="checkbox"
              aria-checked={on}
              onClick={() => setPicks((p) => (on ? p.filter((x) => x !== folder.id) : [...p, folder.id]))}
              className={cn('flex items-center gap-1.5 rounded-sm border px-2.5 py-1 text-xs', on ? 'border-primary bg-primary-soft text-foreground' : 'border-border text-muted-foreground hover:text-foreground')}
            >
              {on && <Check className="h-3 w-3" />} {folder.name}
            </button>
          );
        })}
        <button type="button" disabled={!keys.length} onClick={onNew} className="rounded-sm border border-dashed border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50">
          + New shelf with these
        </button>
        <Button
          disabled={!keys.length || !picks.length}
          onClick={() => {
            onApply(picks);
            toast.success(`Shelved ${keys.length}`, `On ${picks.length} shelf${picks.length > 1 ? 'ves' : ''}.`);
          }}
          className="ml-auto h-8"
        >
          Add
        </Button>
      </div>
      {extra}
    </div>
  );
}

/**
 * One-off entrance on mount. `entered` is false on the first paint and true
 * a frame later (flip styles on it); `settled` turns true `settleMs` after
 * that, when staggered delays should be dropped so later state changes
 * (hover, drop targets, selection lift) respond instantly. Both are true
 * straight away when the user prefers reduced motion.
 */
export function useEntered(settleMs = 600): { entered: boolean; settled: boolean } {
  const [entered, setEntered] = useState(false);
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- skip the entrance
      setEntered(true);
      setSettled(true);
      return;
    }
    // Two frames: the first commits the "before" styles, the second flips them.
    let raf2 = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        setEntered(true);
        timer = setTimeout(() => setSettled(true), settleMs);
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      if (timer) clearTimeout(timer);
    };
    // Entrance runs once per mount; settleMs is fixed by then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { entered, settled };
}
