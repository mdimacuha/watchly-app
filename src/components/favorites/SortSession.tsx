'use client';

import React, { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { Check, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { buildImageUrl } from '@/lib/tmdb';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/button';
import type { FoldersApi } from './useShelves';
import { NameDialog, favImage, favKey, favName, favYear, type Fav } from './favoritesParts';

const TYPE: Record<Fav['type'], string> = { movie: 'Film', tv: 'Series', collection: 'Collection', artist: 'Artist' };

/**
 * Shelve favorites one at a time. Starts with the unshelved ones; at the end
 * offers to keep going through everything (a favorite can sit on more
 * shelves). Keys: 1–9 toggle the first nine shelves · Enter / → save + next · S skip ·
 * N new shelf · Esc end.
 */
export function SortSession({ unshelved, all, f, onClose }: { unshelved: Fav[]; all: Fav[]; f: FoldersApi; onClose: () => void }) {
  const [phase, setPhase] = useState<'unshelved' | 'all'>(unshelved.length ? 'unshelved' : 'all');
  // Snapshot the queue so shelving an item doesn't reshuffle it mid-session.
  const [queue, setQueue] = useState(unshelved.length ? unshelved : all);
  const [i, setI] = useState(0);
  const [shelved, setShelved] = useState(0);
  const fav = queue[i];
  const done = i >= queue.length;

  return (
    <Modal isOpen onClose={onClose} hideCloseButton className="max-w-2xl">
      <div className="flex flex-col gap-5 p-6">
        <div className="flex items-center justify-between">
          <p className="type-kicker text-muted-foreground">
            Sort session · {phase === 'unshelved' ? 'Unshelved' : 'Everything'} · {Math.min(i + 1, queue.length)} / {queue.length}
          </p>
          <button onClick={onClose} aria-label="End session" className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="h-0.5 rounded-full bg-border">
          <div className="h-full rounded-full bg-primary transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${(i / Math.max(queue.length, 1)) * 100}%` }} />
        </div>

        {done ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <p className="type-display text-4xl text-foreground">{phase === 'unshelved' ? 'Nothing left unshelved' : 'All sorted'}</p>
            <p className="text-sm text-muted-foreground">{shelved} favorites shelved this session.</p>
            <div className="flex gap-2">
              {phase === 'unshelved' && all.length > 0 && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setPhase('all');
                    setQueue(all);
                    setI(0);
                  }}
                >
                  Keep going with everything
                </Button>
              )}
              <Button onClick={onClose}>Done</Button>
            </div>
          </div>
        ) : (
          <SortCard
            key={favKey(fav)}
            fav={fav}
            f={f}
            onNext={(changed) => {
              if (changed) setShelved((n) => n + 1);
              setI((n) => n + 1);
            }}
          />
        )}
      </div>
    </Modal>
  );
}

/** One favorite: shelf toggles (1–9 for the first nine; the list scrolls), save + next (Enter/→), skip (S), new shelf (N). */
function SortCard({ fav, f, onNext }: { fav: Fav; f: FoldersApi; onNext: (changed: boolean) => void }) {
  const key = favKey(fav);
  const initial = f.foldersOf(key);
  const [picks, setPicks] = useState<string[]>(initial);
  const [naming, setNaming] = useState(false);
  const shelves = f.folders;
  const listRef = useRef<HTMLOListElement>(null);
  const [created, setCreated] = useState<string | null>(null);
  const img = buildImageUrl(favImage(fav), 'w500');

  const toggle = (id: string) => setPicks((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const save = () => {
    const changed = picks.length !== initial.length || picks.some((p) => !initial.includes(p));
    if (changed) f.setItemFolders(key, picks);
    onNext(changed && picks.length > 0);
  };

  // A new shelf lands at the bottom of the list: bring it into view.
  useEffect(() => {
    if (!created) return;
    listRef.current?.querySelector(`[data-shelf="${created}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [created, shelves.length]);

  useEffect(() => {
    if (naming) return;
    const onKey = (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (n >= 1 && n <= Math.min(9, shelves.length)) toggle(shelves[n - 1].id);
      else if (e.key === 'Enter' || e.key === 'ArrowRight') {
        e.preventDefault();
        save();
      } else if (e.key === 's' || e.key === 'S') onNext(false);
      else if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        setNaming(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  return (
    <div className="grid gap-6 sm:grid-cols-[180px_minmax(0,1fr)]">
      <div className="relative aspect-2/3 w-full overflow-hidden rounded-sm border border-border bg-card">
        {img && <Image src={img} alt="" fill sizes="180px" className="object-cover" />}
      </div>
      <div className="flex min-w-0 flex-col gap-3">
        <div>
          <p className="text-xl font-bold text-foreground">{favName(fav)}</p>
          <p className="text-sm text-muted-foreground">{[TYPE[fav.type], favYear(fav)].filter(Boolean).join(' · ')}</p>
        </div>
        {shelves.length === 0 ? (
          <p className="text-sm text-muted-foreground">No shelves yet — press N to make the first one.</p>
        ) : (
          // Bento: each tile is as wide as its name, and tiles grow to fill their row.
          <ol ref={listRef} className="-mr-2 flex max-h-72 flex-wrap content-start gap-1.5 overflow-y-auto overscroll-contain pr-2" aria-label="Shelves">
            {shelves.map((s, n) => {
              const on = picks.includes(s.id);
              return (
                <li key={s.id} data-shelf={s.id} className="flex min-w-0 max-w-full grow">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    title={s.name}
                    onClick={() => toggle(s.id)}
                    className={cn(
                      'flex w-full min-w-0 items-center gap-2 rounded-md border px-3 py-2 text-left text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      on ? 'border-primary bg-primary-soft' : 'border-border hover:border-foreground/30',
                    )}
                  >
                    {/* Only the first nine have a number key. */}
                    {n < 9 && (
                      <kbd className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm bg-secondary font-mono text-[11px]">{n + 1}</kbd>
                    )}
                    <span className="min-w-0 flex-1 truncate">{s.name}</span>
                    {/* Check slot is always reserved so ticking never reflows the grid. */}
                    <Check className={cn('h-4 w-4 shrink-0 text-primary', !on && 'invisible')} />
                  </button>
                </li>
              );
            })}
          </ol>
        )}
        <div className="flex flex-wrap gap-2 pt-1">
          <Button onClick={save} className="h-9 gap-2">
            Next <kbd className="font-mono text-[11px] opacity-80">↵</kbd>
          </Button>
          <Button variant="secondary" onClick={() => setNaming(true)} className="h-9 gap-2">
            <kbd className="font-mono text-[11px]">N</kbd> New shelf
          </Button>
          <Button variant="ghost" onClick={() => onNext(false)} className="h-9 gap-2">
            <kbd className="font-mono text-[11px]">S</kbd> Skip
          </Button>
        </div>
      </div>
      <NameDialog
        open={naming}
        title="New shelf"
        submitLabel="Create"
        onClose={() => setNaming(false)}
        onSubmit={(name) => {
          // New shelf is ticked for this favorite; saved on Next like the others.
          const id = f.createFolder(name);
          setPicks((p) => [...p, id]);
          setCreated(id);
        }}
      />
    </div>
  );
}
