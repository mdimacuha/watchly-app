'use client';

import { useId, useState } from 'react';
import Image from 'next/image';
import { ChevronDown, Loader2, Plus, RotateCw, Shuffle } from 'lucide-react';
import { cn } from '@/lib/cn';
import { anton } from '@/lib/fonts';
import { buildImageUrl } from '@/lib/tmdb';
import { formatRuntime } from '@/lib/format';
import { QuickViewLink } from '@/components/watchly/QuickViewLink';
import type { ListRec } from '@/services/watchlists/recs';
import { useListRecs } from './useListRecs';

/**
 * More for this list ("Double Feature"), under a watchlist's items (owner
 * only): one two-part ticket per list title, ON YOUR LIST on the left and
 * the picks it brought in as NEXT SHOWING on the right. Closed on every
 * visit; nothing is requested until it's opened. It keeps itself topped up
 * as picks are added, and "More picks" deals a fresh set.
 */
export function ListRecs({ watchlistId, seedPosters, onListChanged }: { watchlistId: string; seedPosters: Map<string, string | null>; onListChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const recs = useListRecs(watchlistId, onListChanged);

  return (
    <section aria-label="More for this list" className={cn(anton.variable, 'rounded-lg border border-border bg-card')}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) recs.onOpen();
        }}
        className="flex w-full cursor-pointer items-center gap-4 rounded-lg px-5 py-4 text-left hover:bg-secondary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="type-kicker text-muted-foreground">Programme notes · picked by Watchly</span>
          <span className="type-display text-3xl leading-none text-foreground">More for this list</span>
          <span className="text-sm text-muted-foreground">Similar titles, picked from what&apos;s on this list and tuned to your taste.</span>
        </span>
        <ChevronDown size={20} aria-hidden className={cn('shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none', open && 'rotate-180')} />
      </button>

      {open && (
        <div id={panelId} className="border-t border-dashed border-border p-5">
          {recs.phase === 'loading' || recs.phase === 'idle' ? (
            <Skeleton />
          ) : recs.phase === 'error' ? (
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              Couldn&apos;t load picks just now.
              <button type="button" onClick={recs.retry} className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-border px-3 text-xs font-semibold text-foreground hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <RotateCw size={13} aria-hidden /> Try again
              </button>
            </div>
          ) : recs.phase === 'thin' ? (
            <p className="text-sm text-muted-foreground">
              Add {recs.need} more {recs.need === 1 ? 'title' : 'titles'} and Watchly can suggest more like them.
            </p>
          ) : recs.shown.length === 0 ? (
            recs.fetching ? (
              <Skeleton />
            ) : (
              <p className="text-sm text-muted-foreground">That&apos;s every pick for this list for now. Add a title and there&apos;ll be more like it.</p>
            )
          ) : (
            <div className="flex flex-col gap-4">
              <DoubleFeature picks={recs.shown} busy={recs.busy} onAdd={recs.add} seedPosters={seedPosters} />
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground" aria-live="polite">
                  {recs.fetching ? 'Finding more…' : recs.done && !recs.canShowMore ? 'All picks for this list shown' : ' '}
                </span>
                {recs.canShowMore && (
                  <button
                    type="button"
                    onClick={recs.showMore}
                    disabled={recs.fetching && !recs.canShowMore}
                    className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border border-border px-3.5 text-sm font-semibold text-foreground hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                  >
                    {recs.fetching ? <Loader2 size={14} className="animate-spin motion-reduce:animate-none" aria-hidden /> : <Shuffle size={14} aria-hidden />} More picks
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

type PicksProps = { picks: ListRec[]; busy: string | null; onAdd: (r: ListRec, rank: number) => void };

const meta = (r: ListRec) => [r.year, r.runtimeMinutes ? formatRuntime(r.runtimeMinutes) : null, r.genres[0]].filter(Boolean).join(' · ');

/** One ticket per list title: ON YOUR LIST | NEXT SHOWING (its picks, already capped by the hook). */
function DoubleFeature({ picks, busy, onAdd, seedPosters }: PicksProps & { seedPosters: Map<string, string | null> }) {
  const groups: { key: string; title: string; rows: { r: ListRec; n: number }[] }[] = [];
  picks.forEach((r, i) => {
    let g = groups.find((x) => x.key === r.seedKey);
    if (!g) {
      g = { key: r.seedKey, title: r.seedTitle, rows: [] };
      groups.push(g);
    }
    g.rows.push({ r, n: i + 1 });
  });
  return (
    <ul className="grid gap-4 lg:grid-cols-2">
      {groups.map((g) => {
        const seedPoster = buildImageUrl(seedPosters.get(g.key) ?? null, 'w185');
        return (
          <li key={g.key} className="flex overflow-hidden rounded-lg border border-border bg-background">
            {/* ON YOUR LIST: the list title leads. */}
            <div className="relative flex w-[42%] shrink-0 flex-col gap-2 bg-secondary/50 p-3">
              <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">On your list</span>
              <div className="flex gap-3">
                <span className="relative aspect-[2/3] w-16 shrink-0 overflow-hidden rounded-sm bg-secondary ring-1 ring-border">{seedPoster && <Image src={seedPoster} alt="" fill sizes="64px" className="object-cover" />}</span>
                <span className="type-display line-clamp-3 text-2xl leading-[1.05] text-foreground">{g.title}</span>
              </div>
            </div>
            {/* The tear between the halves. */}
            <span aria-hidden className="relative w-0 border-l-2 border-dashed border-border">
              <span className="absolute -left-2 -top-2 h-4 w-4 rounded-full bg-card" />
              <span className="absolute -bottom-2 -left-2 h-4 w-4 rounded-full bg-card" />
            </span>
            {/* NEXT SHOWING: what it brought in. */}
            <div className="flex min-w-0 flex-1 flex-col gap-2 p-3">
              <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.2em] text-primary">Next showing</span>
              <ul className="flex flex-col gap-2">
                {g.rows.map(({ r, n }) => {
                  const poster = buildImageUrl(r.posterPath, 'w92');
                  return (
                    <li key={r.key} className="flex items-center gap-2.5">
                      <QuickViewLink mediaType={r.mediaType} titleId={r.tmdbId} className="relative h-12 w-8 shrink-0 overflow-hidden rounded-sm bg-secondary">
                        {poster && <Image src={poster} alt="" fill sizes="32px" className="object-cover" />}
                      </QuickViewLink>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <QuickViewLink mediaType={r.mediaType} titleId={r.tmdbId} className="truncate text-sm font-semibold text-foreground hover:underline">
                          {r.title}
                        </QuickViewLink>
                        <span className="truncate text-[11px] text-muted-foreground">{r.tasteLine ?? meta(r)}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => onAdd(r, n)}
                        disabled={!!busy}
                        aria-label={`Add ${r.title} to this list`}
                        className="inline-flex h-7 shrink-0 cursor-pointer items-center justify-center gap-1 rounded-md px-2 text-xs font-semibold text-primary hover:bg-secondary hover:text-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                      >
                        {busy === r.key ? <Loader2 size={13} className="animate-spin motion-reduce:animate-none" aria-hidden /> : <Plus size={13} aria-hidden />} Add
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Loading, shaped like the tickets, at their final height (nothing jumps). */
function Skeleton() {
  return (
    <div role="status" aria-label="Loading picks" className="flex flex-col gap-3">
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-40 animate-pulse rounded-lg bg-secondary motion-reduce:animate-none" />
        ))}
      </div>
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Picking from this list…</span>
    </div>
  );
}
