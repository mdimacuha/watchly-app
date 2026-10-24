'use client';

import React, { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { cn } from '@/lib/cn';
import { buildImageUrl } from '@/lib/tmdb';
import { formatRelativeAgo } from '@/lib/format';
import { getWatchlistPreviewsAction } from '@/actions/watchlists';
import type { TitlePreview } from '@/services/watchlists';
import {
  ListMenu,
  ProgressRule,
  RuntimePair,
  Toolbar,
  VisibilityIcon,
  plural,
  type List,
  type SortKey,
  type ViewMode,
  type listStats,
} from './watchlistsPageParts';

/** Title, curated-lists line, toolbar, then the four-stat band. */
export function WatchlistsHeader(p: {
  stats: ReturnType<typeof listStats>;
  view: ViewMode;
  sort: SortKey;
  setView: (v: ViewMode) => void;
  setSort: (s: SortKey) => void;
  onCreate: () => void;
}) {
  const { stats } = p;
  const toWatch = Math.max(stats.titles - stats.watched - stats.watching, 0);
  return (
    <header className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="type-display text-6xl text-foreground sm:text-7xl">Watchlists</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            {plural(stats.lists, 'curated list')}
            {stats.latest && <> · last updated {formatRelativeAgo(stats.latest)}</>}
          </p>
        </div>
        <Toolbar view={p.view} sort={p.sort} onView={p.setView} onSort={p.setSort} onCreate={p.onCreate} />
      </div>
      <dl className="grid grid-cols-2 border-y border-border md:grid-cols-4 md:divide-x md:divide-border">
        <Stat label="Watching now" value={stats.watching} />
        <Stat label="To watch" value={toWatch} />
        <Stat label="Watched" value={stats.watched} />
        <Stat label="Titles saved" value={stats.titles} />
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

// Every cascade image shares one `sizes`, so the browser picks the same TMDB
// URL for a poster whether it's the lead or a peek — scrubbing hits cache.
const SCRUB_SIZES = '(max-width: 768px) 40vw, 240px';
// Posters kept mounted either side of the current one while scrubbing.
const LEAD_WINDOW = 3;
// Unfold starts once a list row has mostly opened (the row expands in 300ms).
const UNFOLD_DELAY_MS = 150;

/**
 * Scrub state for one list, shared by the cover card and the list view's
 * hover preview. Moving the pointer left → right across the bound element
 * steps through the list's titles; the first 12 previews ship with the page
 * and the rest load on first hover. `wheel` also lets the wheel / trackpad
 * step while hovered (cards only — rows keep normal scrolling).
 */
export function useScrub(
  list: List,
  { wheel = false, limit }: { wheel?: boolean; /** Scrub through at most this many previews. */ limit?: number } = {},
) {
  const initial = list.previews?.length
    ? list.previews
    : list.posterPaths.map((posterPath) => ({ posterPath, title: '' }));
  const [full, setFull] = useState<TitlePreview[] | null>(null);
  const requested = useRef(false);
  const items = (full ?? initial).slice(0, limit);
  const n = items.length;
  const [active, setActive] = useState(0);
  const [warm, setWarm] = useState(false);
  const [scrubbing, setScrubbing] = useState(false);
  // Callback ref (state), so the wheel listener attaches whenever the element
  // mounts — list rows render their cascade only after a hover check.
  const [wheelEl, setWheelEl] = useState<HTMLDivElement | null>(null);
  // The wheel listener is attached once per list; it reads the index via ref.
  const activeRef = useRef(0);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);
  // After a wheel step, ignore pointer jitter until the mouse really moves.
  const wheelAnchorX = useRef<number | null>(null);

  const loadAll = () => {
    if (requested.current || list.itemCount <= initial.length) return;
    requested.current = true;
    getWatchlistPreviewsAction(list.id)
      .then((all) => {
        if (all.length > initial.length) setFull(all);
      })
      .catch(() => {
        requested.current = false; // retry on next hover
      });
  };

  const onPointerEnter = () => {
    setWarm(true);
    setScrubbing(true);
    loadAll();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    if (n < 2) return;
    if (wheelAnchorX.current !== null) {
      if (Math.abs(e.clientX - wheelAnchorX.current) < 12) return;
      wheelAnchorX.current = null;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const t = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 0.999);
    setActive(Math.floor(t * n));
  };

  const onPointerLeave = () => {
    setScrubbing(false);
    setActive(0);
    wheelAnchorX.current = null;
  };

  // Wheel / trackpad steps through posters while hovered. Native listener
  // (React's onWheel is passive, so it can't stop the page scrolling). Only
  // takes the scroll while there's a poster to move to; at either end the
  // page scrolls as normal, so a grid of cards never traps you.
  useEffect(() => {
    const el = wheelEl;
    if (!wheel || !el || n < 2) return;
    let acc = 0;
    const STEP = 40; // px of wheel delta per poster; trackpads send many small deltas
    const onWheel = (e: WheelEvent) => {
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      const dir = Math.sign(delta);
      const cur = activeRef.current;
      if (dir === 0 || (dir > 0 && cur >= n - 1) || (dir < 0 && cur <= 0)) {
        acc = 0;
        return; // at an end — let the page scroll
      }
      e.preventDefault();
      wheelAnchorX.current = e.clientX;
      acc += e.deltaMode === 1 ? delta * 16 : delta; // line-mode wheels report lines
      if (Math.abs(acc) < STEP) return;
      const steps = Math.trunc(acc / STEP);
      acc -= steps * STEP;
      setActive(Math.min(Math.max(cur + steps, 0), n - 1));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [wheel, n, wheelEl]);

  /** Jump to poster `i` (pointer hit-tests); respects the post-wheel jitter guard. */
  const seek = (i: number, clientX: number) => {
    if (n < 2) return;
    if (wheelAnchorX.current !== null) {
      if (Math.abs(clientX - wheelAnchorX.current) < 12) return;
      wheelAnchorX.current = null;
    }
    setActive(Math.min(Math.max(i, 0), n - 1));
  };

  return {
    /** Plain render data for CascadeArt (no refs, so it can be passed down). */
    view: { items, n, active, warm, scrubbing, total: full ? n : list.itemCount },
    wheelRef: setWheelEl,
    seek,
    handlers: { onPointerEnter, onPointerMove, onPointerLeave },
  };
}

export type ScrubView = ReturnType<typeof useScrub>['view'];

/**
 * The cascade artwork for a scrub state: the current title as the lead, the
 * next two fanned behind it, spines for what's left, plus caption, count
 * and position track while scrubbing.
 */
export function CascadeArt({
  list,
  s,
  revealed = true,
  className,
}: {
  list: List;
  s: ScrubView;
  /**
   * false = folded: peeks tucked behind the lead, spines hidden. Flipping to
   * true unfolds it left → right (peeks slide out, then spines appear one by
   * one). Cards are always revealed; list rows unfold as they open.
   */
  revealed?: boolean;
  className?: string;
}) {
  const { items, n, active, warm, scrubbing, total } = s;
  const peeks = [items[active + 1], items[active + 2]].filter(Boolean);
  // Titles after the lead and its visible peeks.
  const spines = Math.min(Math.max(list.itemCount - active - 1 - peeks.length, 0), 14);
  const lead = items[active];

  return (
    <div className={cn('relative aspect-[16/9] w-full', className)}>
      {/* Spines: what's left after the visible three */}
      <div aria-hidden className="absolute bottom-[4%] right-[2%] top-[6%] left-[70%] flex gap-[3%]">
        {Array.from({ length: spines }).map((_, i) => (
          <span
            key={i}
            className="h-full w-[4%] min-w-[3px] rounded-[1px] bg-secondary transition-[opacity,translate] duration-300 ease-out motion-reduce:transition-none"
            style={{
              opacity: revealed ? 1 - i * 0.06 : 0,
              translate: revealed ? '0' : '-12px 0',
              transitionDelay: revealed ? `${UNFOLD_DELAY_MS + 220 + i * 35}ms` : '0ms',
            }}
          />
        ))}
      </div>

      {/* Next two, furthest first */}
      {peeks
        .map((p, i) => ({ p: p!, i }))
        .reverse()
        .map(({ p, i }) => (
          <div
            key={`${i}-${p.posterPath}`}
            aria-hidden
            className="absolute bottom-[4%] top-[4%] aspect-2/3 overflow-hidden rounded-sm border border-border brightness-50 transition-[left] duration-500 ease-out motion-reduce:transition-none"
            style={{
              left: revealed ? `${[17, 32][i]}%` : '0%',
              transitionDelay: revealed ? `${UNFOLD_DELAY_MS + i * 90}ms` : '0ms',
            }}
          >
            <Image src={buildImageUrl(p.posterPath, 'w342')!} alt="" fill sizes={SCRUB_SIZES} className="object-cover" />
          </div>
        ))}

      {/* Lead: once warm, posters near the current one stay mounted (faded)
          so the next steps are already loaded; far ones aren't fetched. */}
      <div className="absolute inset-y-0 left-0 w-[34%] overflow-hidden rounded-sm border border-foreground/10 bg-card shadow-elevation-card">
        {n === 0 ? (
          <span className="absolute inset-0 flex items-end p-3 pl-9 type-display text-2xl text-muted-foreground">Empty</span>
        ) : (
          items.map((it, i) =>
            (warm ? Math.abs(i - active) <= LEAD_WINDOW : i === 0) ? (
              <Image
                key={`${i}-${it.posterPath}`}
                src={buildImageUrl(it.posterPath, 'w342')!}
                alt=""
                fill
                sizes={SCRUB_SIZES}
                className={cn(
                  'object-cover transition-opacity duration-150 motion-reduce:transition-none',
                  i === active ? 'opacity-100' : 'opacity-0',
                )}
              />
            ) : null,
          )
        )}
        <span className="absolute inset-y-0 left-0 flex w-6 items-center justify-center bg-background/90">
          <span className="type-display max-h-[90%] truncate text-xs text-foreground [writing-mode:vertical-rl] rotate-180">{list.name}</span>
        </span>
        {scrubbing && lead?.title && (
          <span className="absolute inset-x-0 bottom-0 bg-background/90 py-1 pl-8 pr-2 text-[11px] font-medium leading-tight text-foreground line-clamp-2">
            {lead.title}
          </span>
        )}
        <span
          className={cn(
            'absolute right-1.5 rounded-sm bg-background/90 px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-foreground',
            scrubbing ? 'top-1.5' : 'bottom-1.5',
          )}
        >
          {scrubbing && n > 1 ? `${active + 1}/${total}` : list.itemCount}
        </span>
      </div>

      {/* Scrub track: continuous bar + position marker (reads at 100 titles too) */}
      {scrubbing && n > 1 && (
        <div aria-hidden className="absolute -bottom-2 left-0 right-0 h-0.5 rounded-full bg-border">
          <span
            className="absolute inset-y-0 min-w-1.5 rounded-full bg-primary"
            style={{ left: `${(active / n) * 100}%`, width: `${100 / n}%` }}
          />
        </div>
      )}
    </div>
  );
}

// Wide (list-row) cascade: posters at a fixed height laid across the full
// width. They spread to fill it but never further apart than WIDE_STEP_PX.
export const WIDE_MAX = 24;
const WIDE_POSTER_W = 136; // h-[204px] at 2:3
const WIDE_STEP_PX = 104;

/**
 * Full-width variant of the cascade for list rows: every preview (up to
 * WIDE_MAX) laid left → right as an overlapping stack, with spines for any
 * titles past that. The scrubbed title lifts out of the stack with its
 * name and position; the rest stay dimmed. Unfolds left → right on reveal.
 */
export function WideCascade({
  list,
  s,
  revealed,
  seek,
  wheelRef,
}: {
  list: List;
  s: ScrubView;
  revealed: boolean;
  /** From useScrub: jump to the poster under the pointer. */
  seek: (i: number, clientX: number) => void;
  /** From useScrub({ wheel: true }): wheel steps over the posters. */
  wheelRef: (el: HTMLDivElement | null) => void;
}) {
  // Pair with useScrub(list, { limit: WIDE_MAX }) so the scrub index maps
  // onto exactly these posters.
  const { items, n, active, warm, scrubbing, total } = s;
  const shown = items.slice(0, WIDE_MAX);
  const m = shown.length;
  const spines = Math.min(Math.max(list.itemCount - m, 0), 14);
  const current = Math.min(active, m - 1);

  // Stagger delays only while unfolding; afterwards the scrub lift is instant.
  const [unfolding, setUnfolding] = useState(false);
  useEffect(() => {
    if (!revealed) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- animation phase
    setUnfolding(true);
    const t = setTimeout(() => setUnfolding(false), UNFOLD_DELAY_MS + m * 30 + spines * 25 + 500);
    return () => clearTimeout(t);
  }, [revealed, m, spines]);
  const delay = (ms: number) => (revealed && unfolding ? `${ms}ms` : '0ms');

  if (m === 0) {
    return <p className="type-kicker text-muted-foreground">No titles in this list yet</p>;
  }

  // The stage is only as wide as the posters need (capped at the row), so the
  // pointer and wheel act on the posters, not the empty space beside them.
  // Posters spread evenly across the stage; spines (if any) take its right end.
  const reserve = spines ? 56 : 0;
  const naturalW = (m - 1) * WIDE_STEP_PX + WIDE_POSTER_W + reserve;
  const leftFor = (i: number) =>
    m === 1 ? '0px' : `calc((100% - ${WIDE_POSTER_W + reserve}px) * ${i / (m - 1)})`;

  // Topmost poster under the pointer: earlier posters sit on top, so it's
  // the first one whose span contains x.
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (m === 1) return seek(0, e.clientX);
    const step = (rect.width - WIDE_POSTER_W - reserve) / (m - 1);
    const i = Math.max(0, Math.ceil((x - WIDE_POSTER_W) / step));
    if (i < m && i * step <= x) seek(i, e.clientX);
  };

  return (
    <div
      ref={wheelRef}
      className="relative h-[204px] touch-pan-y select-none"
      style={{ width: `min(${naturalW}px, 100%)` }}
      onPointerMove={onPointerMove}
    >
      {shown.map((it, i) => {
        const isActive = scrubbing && i === current;
        return (
          <div
            key={`${i}-${it.posterPath}`}
            className={cn(
              'absolute inset-y-0 aspect-2/3 overflow-hidden rounded-sm border bg-card transition-[left,translate,filter] duration-500 ease-out motion-reduce:transition-none',
              isActive ? 'border-foreground/30 shadow-elevation-card' : 'border-border',
              !isActive && (scrubbing || i > 0) && 'brightness-50',
            )}
            style={{
              left: revealed ? leftFor(i) : '0px',
              zIndex: isActive ? m + 1 : m - i,
              translate: isActive ? '0 -6px' : '0 0',
              transitionDelay: delay(UNFOLD_DELAY_MS + i * 30),
            }}
          >
            {(warm || i < 3) && (
              <Image src={buildImageUrl(it.posterPath, 'w185')!} alt="" fill sizes={`${WIDE_POSTER_W}px`} className="object-cover" />
            )}
            {isActive && (
              <>
                <span className="absolute right-1.5 top-1.5 rounded-sm bg-background/90 px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-foreground">
                  {active + 1}/{total}
                </span>
                {it.title && (
                  <span className="absolute inset-x-0 bottom-0 bg-background/90 px-2 py-1 text-[11px] font-medium leading-tight text-foreground line-clamp-2">
                    {it.title}
                  </span>
                )}
              </>
            )}
          </div>
        );
      })}

      {/* Titles past WIDE_MAX */}
      {spines > 0 && (
        <div aria-hidden className="absolute bottom-[4%] right-0 top-[6%] flex w-[48px] gap-[2px]">
          {Array.from({ length: spines }).map((_, i) => (
            <span
              key={i}
              className="h-full w-[2px] rounded-[1px] bg-secondary transition-opacity duration-300 motion-reduce:transition-none"
              style={{
                opacity: revealed ? 1 - i * 0.05 : 0,
                transitionDelay: delay(UNFOLD_DELAY_MS + m * 30 + i * 25),
              }}
            />
          ))}
        </div>
      )}

      {/* Position track */}
      {scrubbing && n > 1 && (
        <div aria-hidden className="absolute -bottom-3 left-0 right-0 h-0.5 rounded-full bg-border">
          <span
            className="absolute inset-y-0 min-w-1.5 rounded-full bg-primary"
            style={{ left: `${(active / n) * 100}%`, width: `${100 / n}%` }}
          />
        </div>
      )}
    </div>
  );
}

/** Cover-card cascade: scrub by pointer or wheel. */
function ScrubCascade({ list }: { list: List }) {
  const { view, wheelRef, handlers } = useScrub(list, { wheel: true });
  return (
    <div ref={wheelRef} className="touch-pan-y select-none" {...handlers}>
      <CascadeArt list={list} s={view} />
    </div>
  );
}

/**
 * Cover + name / visibility / watched line / progress, with the ⋯ menu beside
 * the link. Read-only (no menu) when the change handlers are omitted, e.g. on
 * a profile.
 */
export function WatchlistCoverCard({
  list,
  onChanged,
  onDeleted,
}: {
  list: List;
  onChanged?: (next: List) => void;
  onDeleted?: (id: string) => void;
}) {
  return (
    <li className="group relative flex flex-col">
      <Link
        href={`/watchlists/${list.id}`}
        className="flex flex-col gap-3 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ScrubCascade list={list} />
        <div className="pr-9">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <span className="truncate">{list.name}</span>
            <VisibilityIcon isPublic={list.isPublic} className="shrink-0" />
          </p>
          <p className="text-xs text-muted-foreground">
            {list.itemCount === 0 ? 'No titles yet' : `${list.finishedCount ?? 0} of ${plural(list.itemCount, 'title')} watched`}
          </p>
          <RuntimePair list={list} className="mt-0.5 text-xs text-muted-foreground" />
          <ProgressRule list={list} className="mt-2" />
        </div>
      </Link>
      {onChanged && onDeleted && (
        <ListMenu list={list} onChanged={onChanged} onDeleted={onDeleted} className="absolute bottom-3 right-0" />
      )}
    </li>
  );
}
