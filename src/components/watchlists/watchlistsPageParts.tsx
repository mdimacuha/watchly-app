'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Clock,
  Copy,
  ExternalLink,
  Globe,
  LayoutGrid,
  List as ListIcon,
  Lock,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatRuntime } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { ConfirmDestructiveModal } from '@/components/ui/ConfirmDestructiveModal';
import { useToast } from '@/hooks/useToast';
import { deleteWatchlistAction, updateWatchlistAction } from '@/actions/watchlists';
import type { WatchlistWithCount } from '@/services/watchlists';
import { WatchlistFormModal } from './WatchlistFormModal';

// Pieces of the /watchlists page: sorting, remembered view/sort, stats,
// progress rule, toolbar and the per-list ⋯ menu.

export type List = WatchlistWithCount;
export type ViewMode = 'grid' | 'list';
export type SortKey = 'updated' | 'created' | 'name' | 'titles';

export const SORTS: { key: SortKey; label: string }[] = [
  { key: 'updated', label: 'Recently updated' },
  { key: 'created', label: 'Recently created' },
  { key: 'name', label: 'Name A–Z' },
  { key: 'titles', label: 'Most titles' },
];

export const lastActivity = (l: List) => new Date(l.lastActivityAt ?? l.updatedAt);

export function sortLists(lists: List[], sort: SortKey): List[] {
  const out = [...lists];
  switch (sort) {
    case 'created':
      return out.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
    case 'name':
      return out.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    case 'titles':
      return out.sort((a, b) => b.itemCount - a.itemCount);
    default:
      return out.sort((a, b) => +lastActivity(b) - +lastActivity(a));
  }
}

const PREFS_KEY = 'watchly:watchlists-prefs';

/** View + sort, remembered per browser. Read after mount (server renders the default). */
export function useListPrefs(defaultView: ViewMode) {
  const [view, setView] = useState<ViewMode>(defaultView);
  const [sort, setSort] = useState<SortKey>('updated');

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as { view?: ViewMode; sort?: SortKey };
      // eslint-disable-next-line react-hooks/set-state-in-effect -- per-browser preference
      if (saved.view === 'grid' || saved.view === 'list') setView(saved.view);
      if (SORTS.some((s) => s.key === saved.sort)) setSort(saved.sort!);
    } catch {}
  }, []);

  const persist = (next: { view?: ViewMode; sort?: SortKey }) => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ view, sort, ...next }));
    } catch {}
  };

  return {
    view,
    sort,
    setView: (v: ViewMode) => {
      setView(v);
      persist({ view: v });
    },
    setSort: (s: SortKey) => {
      setSort(s);
      persist({ sort: s });
    },
  };
}

export function listStats(lists: List[]) {
  const titles = lists.reduce((n, l) => n + l.itemCount, 0);
  const watched = lists.reduce((n, l) => n + (l.finishedCount ?? 0), 0);
  const watching = lists.reduce((n, l) => n + (l.watchingCount ?? 0), 0);
  const latest = lists.length ? new Date(Math.max(...lists.map((l) => +lastActivity(l)))) : null;
  return { lists: lists.length, titles, watched, watching, latest };
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const minutes = (m: number) => formatRuntime(m) ?? '0m';

/** "20h 5m / 155h 20m" — watched runtime / total runtime. Null when unknown. */
export function RuntimePair({ list, className }: { list: List; className?: string }) {
  if (!list.runtimeMinutes) return null;
  return (
    <span className={cn('inline-flex items-center gap-1 tabular-nums', className)} title="Watched / total runtime">
      <Clock className="h-3 w-3 shrink-0" aria-hidden />
      <span className="text-foreground">{minutes(list.watchedRuntimeMinutes ?? 0)}</span>
      <span>/ {minutes(list.runtimeMinutes)}</span>
      <span className="sr-only">watched of total runtime</span>
    </span>
  );
}

/** Finished / in progress / not started as one thin rule. */
export function ProgressRule({ list, className }: { list: List; className?: string }) {
  const total = list.itemCount;
  const finished = list.finishedCount ?? 0;
  const watching = list.watchingCount ?? 0;
  if (total === 0) return <div className={cn('h-0.5 rounded-full bg-border', className)} />;
  return (
    <div
      className={cn('flex h-0.5 overflow-hidden rounded-full bg-border', className)}
      role="img"
      aria-label={`${finished} of ${total} watched, ${watching} in progress`}
    >
      <span className="bg-primary" style={{ width: `${(finished / total) * 100}%` }} />
      <span className="bg-primary/50" style={{ width: `${(watching / total) * 100}%` }} />
    </div>
  );
}

export function VisibilityIcon({ isPublic, className }: { isPublic: boolean; className?: string }) {
  const Icon = isPublic ? Globe : Lock;
  return (
    <Icon
      className={cn('w-3.5 h-3.5 text-muted-foreground', className)}
      aria-label={isPublic ? 'Public' : 'Private'}
    />
  );
}

/** Sort select + grid/list toggle + New list. */
export function Toolbar({
  view,
  sort,
  onView,
  onSort,
  onCreate,
  className,
}: {
  view: ViewMode;
  sort: SortKey;
  onView: (v: ViewMode) => void;
  onSort: (s: SortKey) => void;
  onCreate: () => void;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <label className="sr-only" htmlFor="watchlists-sort">Sort lists</label>
      <select
        id="watchlists-sort"
        value={sort}
        onChange={(e) => onSort(e.target.value as SortKey)}
        className="h-9 rounded-md border border-border bg-card px-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      >
        {SORTS.map((s) => (
          <option key={s.key} value={s.key}>{s.label}</option>
        ))}
      </select>
      <div role="radiogroup" aria-label="View" className="flex rounded-md border border-border bg-card p-0.5">
        {(
          [
            ['grid', LayoutGrid, 'Grid view'],
            ['list', ListIcon, 'List view'],
          ] as const
        ).map(([key, Icon, label]) => (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={view === key}
            aria-label={label}
            title={label}
            onClick={() => onView(key)}
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              view === key ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="w-4 h-4" />
          </button>
        ))}
      </div>
      <Button onClick={onCreate} className="h-9 gap-2">
        <Plus className="w-4 h-4" />
        New list
      </Button>
    </div>
  );
}

/**
 * ⋯ menu. Rendered as a sibling of the card link (never inside the <a>).
 */
export function ListMenu({
  list,
  onChanged,
  onDeleted,
  className,
}: {
  list: List;
  onChanged: (next: List) => void;
  onDeleted: (id: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const toast = useToast();
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    itemsRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus();
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const onMenuKey = (e: React.KeyboardEvent) => {
    const items = Array.from(itemsRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? []);
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const d = e.key === 'ArrowDown' ? 1 : -1;
      items[(i + d + items.length) % items.length]?.focus();
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      items[e.key === 'Home' ? 0 : items.length - 1]?.focus();
    }
  };

  const toggleVisibility = async () => {
    setOpen(false);
    const next = { ...list, isPublic: !list.isPublic };
    onChanged(next);
    try {
      await updateWatchlistAction(list.id, { isPublic: next.isPublic });
      toast.success(next.isPublic ? 'List is public' : 'List is private');
    } catch {
      onChanged(list);
      toast.error('Could not change visibility', 'Please try again.');
    }
  };

  const copyLink = async () => {
    setOpen(false);
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/watchlists/${list.id}`);
      toast.success('Link copied');
    } catch {
      toast.error('Could not copy link');
    }
  };

  const item =
    'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-foreground hover:bg-secondary focus:bg-secondary focus:outline-none disabled:cursor-not-allowed disabled:opacity-60';

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Actions for ${list.name}`}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>

      {open && (
        <div
          ref={itemsRef}
          role="menu"
          aria-label={`${list.name} actions`}
          onKeyDown={onMenuKey}
          className="absolute right-0 top-full z-40 mt-1 w-56 overflow-hidden rounded-md border border-border bg-card py-1 shadow-elevation-card"
        >
          <Link role="menuitem" href={`/watchlists/${list.id}`} className={item}>
            <ExternalLink className="w-4 h-4 text-muted-foreground" /> Open
          </Link>
          <button role="menuitem" type="button" className={item} onClick={() => { setOpen(false); setEditing(true); }}>
            <Pencil className="w-4 h-4 text-muted-foreground" /> Edit details
          </button>
          <button role="menuitem" type="button" className={item} onClick={toggleVisibility}>
            {list.isPublic ? <Lock className="w-4 h-4 text-muted-foreground" /> : <Globe className="w-4 h-4 text-muted-foreground" />}
            {list.isPublic ? 'Make private' : 'Make public'}
          </button>
          {list.isPublic && (
            <button role="menuitem" type="button" className={item} onClick={copyLink}>
              <Copy className="w-4 h-4 text-muted-foreground" /> Copy link
            </button>
          )}
          <div className="my-1 border-t border-border" />
          <button
            role="menuitem"
            type="button"
            className={cn(item, 'text-destructive hover:bg-destructive/10 focus:bg-destructive/10')}
            onClick={() => { setOpen(false); setConfirming(true); }}
          >
            <Trash2 className="w-4 h-4" /> Delete list
          </button>
        </div>
      )}

      <WatchlistFormModal
        isOpen={editing}
        onClose={() => setEditing(false)}
        title="Edit watchlist"
        submitLabel="Save"
        initialValues={{ name: list.name, description: list.description ?? '', isPublic: list.isPublic }}
        onSubmit={async (values) => {
          await updateWatchlistAction(list.id, values);
          onChanged({ ...list, ...values, updatedAt: new Date(), lastActivityAt: new Date() });
          setEditing(false);
          toast.success('Watchlist updated');
        }}
      />

      <ConfirmDestructiveModal
        isOpen={confirming}
        onClose={() => setConfirming(false)}
        title={`Delete "${list.name}"?`}
        description={
          list.itemCount > 0
            ? `${plural(list.itemCount, 'title')} will be removed from this list. This can't be undone.`
            : "This can't be undone."
        }
        confirmLabel="Delete list"
        onConfirm={async () => {
          await deleteWatchlistAction(list.id);
          onDeleted(list.id);
          toast.success('Watchlist deleted');
          router.refresh();
        }}
      />
    </div>
  );
}
