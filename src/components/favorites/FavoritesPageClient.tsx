'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Library, ListChecks, Plus, Rows3, Wand2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/useToast';
import { useShelves } from './useShelves';
import type { ShelvesPayload } from '@/services/favorites/shelves';
import { EmptyResults, FavHeader, FavToolbar, favKey, useFavoritesView, type Fav } from './favoritesParts';
import { BulkBar, ShelfGrid, ShelfHeadingMenu, ShelfRail, ShelfVisibilityToggle, shelfColor, suggestShelves, useEntered, useShelfDialogs, useShelfDrop } from './shelfParts';
import { SortSession } from './SortSession';

/**
 * /favorites. Shelves are spines on a rail that stand taller as they fill —
 * click one to open it, drag a card onto one to shelve it — or, in the wide
 * view, a poster rail per shelf. Before the first shelf exists, suggested
 * shelves sit on the rail as dashed ghost spines. Select mode for bulk
 * actions, Sort session for the backlog. Shelves persist via useShelves.
 */
export function FavoritesPageClient({ favorites, shelves }: { favorites: Fav[]; shelves: ShelvesPayload }) {
  const f = useShelves(shelves);
  const v = useFavoritesView(favorites, f.forget);
  const [open, setOpen] = useState<string | null>(null);
  const [sorting, setSorting] = useState(false);
  // Select mode (from B): tick several cards, then add them to shelves in one go.
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const endSelect = () => {
    setSelecting(false);
    setSelected([]);
  };
  const toggleSelect = (k: string) => setSelected((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]));
  // Every shelf switch goes through here: a selection belongs to the shelf
  // it was made on (its bulk actions differ per shelf), so switching ends it.
  // Re-clicking the open shelf isn't a switch, so the selection survives that.
  const goToShelf = (id: string | null) => {
    if (id !== open) endSelect();
    setOpen(id);
  };
  // Shelf view (spine rail, one shelf open at a time) vs wide view (every
  // shelf as a poster rail). Remembered per browser, read after mount.
  const [view, setViewState] = useState<ShelfView>('shelf');
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- per-browser preference
      if (localStorage.getItem(VIEW_KEY) === 'wide') setViewState('wide');
    } catch {}
  }, []);
  const setView = (next: ShelfView) => {
    setViewState(next);
    // Wide shows every shelf at once, so nothing is "open"; the grid is All.
    if (next === 'wide') goToShelf(null);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {}
  };

  const d = useShelfDialogs(f, {
    onCreated: (id) => {
      if (view === 'wide') setViewState('shelf');
      goToShelf(id);
    },
    onDeleted: () => goToShelf(null),
  });
  const drop = useShelfDrop(f);
  const toast = useToast();

  const shelf = view === 'wide' ? null : (f.folders.find((x) => x.id === open) ?? null);
  const items = v.filter(shelf ? v.list.filter((x) => f.foldersOf(favKey(x)).includes(shelf.id)) : v.list);
  const unshelved = v.list.filter((x) => f.foldersOf(favKey(x)).length === 0);
  // Suggested (ghost) spines are a cold-start aid: only while the rail is
  // just "All" with no shelves yet.
  const ghosts = useMemo(
    () => (f.folders.length === 0 ? suggestShelves(v.list, []).slice(0, 4) : []),
    [v.list, f.folders.length],
  );

  return (
    <div className="flex flex-col gap-8">
      <FavHeader
        list={v.list}
        folderCount={f.folders.length}
        folderNoun="shelf"
        action={<HeaderActions onSort={() => setSorting(true)} onNew={() => d.newShelf()} unshelved={unshelved.length} />}
      />

      <div className="flex items-center justify-between gap-3">
        <p className="type-kicker text-muted-foreground">Shelves</p>
        <ViewToggle view={view} onChange={setView} />
      </div>

      {view === 'wide' ? (
        <div className="-mt-4 flex flex-col gap-2">
          {f.folders.length === 0 ? (
            <EmptyResults>
              No shelves yet.{' '}
              <button type="button" onClick={() => setView('shelf')} className="font-semibold text-foreground underline underline-offset-4">
                Switch to shelf view
              </button>{' '}
              for suggestions, or press New shelf.
            </EmptyResults>
          ) : (
            f.folders.map((folder, i) => (
              <ShelfRail
                key={folder.id}
                enterIndex={i}
                label={folder.name}
                color={shelfColor(folder)}
                folder={folder}
                d={d}
                f={f}
                items={f.keysIn(folder.id).map((k) => v.byKey.get(k)).filter((x): x is Fav => !!x)}
                onOpen={() => {
                  setViewState('shelf');
                  try {
                    localStorage.setItem(VIEW_KEY, 'shelf');
                  } catch {}
                  goToShelf(folder.id);
                }}
                dropping={drop.over === folder.id}
                dropProps={drop.props(folder.id, folder.name)}
              />
            ))
          )}
        </div>
      ) : (
      /* pt-4: headroom for the selected spine's lift + outline (overflow-x clips vertically too). */
      <div className="-mt-4 flex items-end gap-1.5 overflow-x-auto border-b-4 border-secondary px-1 pt-4 no-scrollbar" role="tablist" aria-label="Shelves">
        <Spine label="All" count={v.list.length} active={!shelf} enterIndex={0} onClick={() => goToShelf(null)} />
        {f.folders.map((folder, i) => (
          <Spine
            key={folder.id}
            enterIndex={i + 1}
            label={folder.name}
            count={f.keysIn(folder.id).filter((k) => v.byKey.has(k)).length}
            active={open === folder.id}
            color={shelfColor(folder)}
            dropping={drop.over === folder.id}
            onClick={() => goToShelf(folder.id)}
            {...drop.props(folder.id, folder.name)}
          />
        ))}
        {ghosts.map((g, i) => (
          <Spine
            key={g.name}
            enterIndex={f.folders.length + 1 + i}
            ghost
            label={g.name}
            count={g.items.length}
            active={false}
            title={`Make "${g.name}" (${g.items.length})`}
            onClick={() => {
              goToShelf(f.createFolder(g.name, g.items.map(favKey)));
              toast.success(`Made "${g.name}"`, `${g.items.length} favorites shelved.`);
            }}
          />
        ))}
        <button
          type="button"
          onClick={() => d.newShelf()}
          aria-label="New shelf"
          className="flex h-32 w-11 shrink-0 items-center justify-center rounded-t-sm border border-dashed border-border text-muted-foreground hover:text-foreground"
        >
          <Plus className="h-4 w-4" />
        </button>
        <p className="ml-3 hidden self-center text-xs text-muted-foreground lg:block">
          {ghosts.length > 0
            ? 'Dashed spines are suggestions. Click one to make it, or start your own with +.'
            : 'Drag a favorite onto a spine to shelve it.'}
        </p>
      </div>
      )}

      {shelf && (
        <div className="flex items-baseline gap-3">
          <h2 className="type-display text-4xl text-foreground">{shelf.name}</h2>
          <span className="type-kicker text-muted-foreground">{items.length} on this shelf</span>
          <ShelfVisibilityToggle folder={shelf} f={f} />
          <ShelfHeadingMenu folder={shelf} d={d} f={f} />
        </div>
      )}

      <FavToolbar v={v}>
        <Button variant={selecting ? 'default' : 'secondary'} onClick={() => (selecting ? endSelect() : setSelecting(true))} className="h-9 gap-2">
          <ListChecks className="h-4 w-4" /> {selecting ? 'Done' : 'Select'}
        </Button>
      </FavToolbar>
      <ShelfGrid
        items={items}
        v={v}
        f={f}
        d={d}
        current={shelf}
        // Dragging is off while selecting, so a click only ever toggles the card.
        draggable={!selecting}
        selecting={selecting}
        selected={selected}
        onToggle={toggleSelect}
        empty={shelf ? 'This shelf is empty. Drag favorites onto its spine, use Select, or a card’s ⋯ menu.' : 'No favorites match.'}
      />

      {selecting && (
        // In "All": add to shelves or remove from favorites.
        // Inside a shelf: take off this shelf or remove from favorites.
        <BulkBar
          keys={selected}
          folders={f.folders}
          shelf={shelf}
          onApply={(ids) => {
            ids.forEach((id) => f.addItems(selected, id));
            endSelect();
          }}
          onNew={() => d.newShelf(selected)}
          onTakeOff={() => {
            if (shelf) f.removeManyFromFolder(selected, shelf.id);
            endSelect();
          }}
          onRemove={() => {
            void v.removeMany(selected.map((k) => v.byKey.get(k)).filter((x): x is Fav => !!x));
            endSelect();
          }}
          onCancel={endSelect}
        />
      )}
      {sorting && <SortSession unshelved={unshelved} all={v.list} f={f} onClose={() => setSorting(false)} />}
      {d.dialogs}
    </div>
  );
}

export function HeaderActions({ onSort, onNew, unshelved }: { onSort: () => void; onNew: () => void; unshelved: number }) {
  return (
    <div className="flex gap-2">
      <Button variant="secondary" onClick={onNew} className="h-9 gap-2">
        <Plus className="h-4 w-4" /> New shelf
      </Button>
      <Button onClick={onSort} className="h-9 gap-2">
        <Wand2 className="h-4 w-4" /> Sort session{unshelved > 0 && ` · ${unshelved}`}
      </Button>
    </div>
  );
}

/** A spine: name in Anton set vertically, count at the foot; fuller shelves stand taller. */
// Spine sizing. Names set vertically in Anton (~0.5em per uppercase glyph):
// the spine grows to fit the name, type steps down for long names, and past
// SPINE_MAX_H it truncates with an ellipsis (full name in the tooltip).
const SPINE_MIN_H = 128;
const SPINE_MAX_H = 280;
const SPINE_CHROME = 40; // padding + count label
const SPINE_STAGGER_MS = 30;

function spineType(label: string) {
  const len = label.length;
  const px = len <= 14 ? 14 : len <= 24 ? 12 : 11;
  const nameH = Math.ceil(len * px * 0.52);
  return { px, nameH };
}

function Spine({
  label,
  count,
  active,
  ghost,
  color,
  dropping,
  title,
  enterIndex = 0,
  onClick,
  ...drop
}: {
  label: string;
  count: number;
  active: boolean;
  ghost?: boolean;
  /** Shelf colour (accent palette hex); white text on it. */
  color?: string | null;
  dropping?: boolean;
  title?: string;
  /** Position on the rail; spines rise into place one after another on mount. */
  enterIndex?: number;
  onClick: () => void;
} & Pick<React.HTMLAttributes<HTMLButtonElement>, 'onDragOver' | 'onDragLeave' | 'onDrop'>) {
  const { px, nameH } = spineType(label);
  // Fuller shelves stand taller; long names make room for themselves.
  const height = Math.min(Math.max(SPINE_MIN_H + Math.min(count, 24) * 2, nameH + SPINE_CHROME), SPINE_MAX_H);
  const colored = !!color && !ghost;
  // Entrance: rise from the rail, staggered left → right. `transform` here,
  // so it doesn't fight the selected lift (which uses `translate`).
  const riseDelay = Math.min(enterIndex, 16) * SPINE_STAGGER_MS;
  const { entered, settled } = useEntered(riseDelay + 400);

  return (
    <button
      type="button"
      role={ghost ? undefined : 'tab'}
      aria-selected={ghost ? undefined : active}
      aria-label={ghost ? title : `${label}, ${count} favorites`}
      title={title ?? label}
      onClick={onClick}
      {...drop}
      style={{
        height,
        ...(colored ? { background: color!, borderColor: color! } : null),
        transform: entered ? 'none' : 'translateY(100%)',
        opacity: entered ? 1 : 0,
        transitionDelay: entered && !settled ? `${riseDelay}ms` : '0ms',
      }}
      className={cn(
        'flex w-11 shrink-0 flex-col items-center justify-between rounded-t-sm border border-b-0 py-2 transition-[transform,translate,opacity,background-color] duration-300 ease-out motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        ghost
          ? 'border-dashed border-muted-foreground/40 text-muted-foreground hover:border-primary hover:text-foreground'
          : colored
            ? 'text-white hover:brightness-110'
            : 'border-border bg-card text-foreground hover:bg-secondary',
        // Selected: lifted off the rail with an outline (fills now carry the shelf colour).
        active && !ghost && '-translate-y-2 ring-2 ring-foreground ring-offset-2 ring-offset-background',
        dropping && 'ring-2 ring-primary',
      )}
    >
      <span
        className="type-display min-h-0 flex-1 truncate leading-none [writing-mode:vertical-rl] rotate-180"
        style={{ fontSize: px }}
      >
        {label}
      </span>
      <span className="mt-1 font-mono text-[10px] tabular-nums">{ghost ? `+${count}` : count}</span>
    </button>
  );
}

type ShelfView = 'shelf' | 'wide';
const VIEW_KEY = 'watchly:favorites-shelf-view';

/** Shelf view (spine rail) ↔ wide shelf view (a poster rail per shelf). */
function ViewToggle({ view, onChange }: { view: ShelfView; onChange: (v: ShelfView) => void }) {
  return (
    <div role="radiogroup" aria-label="Shelf view" className="flex rounded-md border border-border bg-card p-0.5">
      {(
        [
          ['shelf', Library, 'Shelf view'],
          ['wide', Rows3, 'Wide shelf view'],
        ] as const
      ).map(([key, Icon, label]) => (
        <button
          key={key}
          type="button"
          role="radio"
          aria-checked={view === key}
          title={label}
          onClick={() => onChange(key)}
          className={cn(
            'flex h-8 items-center gap-1.5 rounded-sm px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            view === key ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <Icon className="h-4 w-4" />
          <span className="hidden sm:inline">{key === 'shelf' ? 'Shelf' : 'Wide'}</span>
        </button>
      ))}
    </div>
  );
}
