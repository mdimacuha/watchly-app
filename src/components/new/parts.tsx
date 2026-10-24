'use client';

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, Eye, EyeOff, Maximize2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { getCountryName } from '@/lib/regions/countries';
import { QuickViewLink } from '@/components/watchly/QuickViewLink';
import type { NewChannel, NewEpisode, NewFeed, NewFilm, NewShow } from '@/services/newReleases';

// Parts for New & Coming Soon ("The Lobby"): the Arrivals board for films
// (split-flap letters; a row opens on hover, focus or tap: date above the
// title, director below, poster in from the left, the still lighting it from
// behind, the synopsis and a ticket stub to the title page) and the
// Timetable for TV (days across, channels down). Dates are calendar strings
// (YYYY-MM-DD) formatted in UTC so they never shift a day. TV has days,
// never hours.

const asDate = (day: string) => new Date(`${day}T12:00:00Z`);
const fmt = (day: string, o: Intl.DateTimeFormatOptions) => asDate(day).toLocaleDateString('en-US', { timeZone: 'UTC', ...o });

/** "Fri 31". */
export const dayShort = (day: string) => fmt(day, { weekday: 'short', day: 'numeric' });
/** "Friday, October 31". */
export const dayLong = (day: string) => fmt(day, { weekday: 'long', month: 'long', day: 'numeric' });
/** "Today" · "Tomorrow" · "Fri 31". */
export function dayLabel(day: string, today: string): string {
  if (day === today) return 'Today';
  const t = asDate(today);
  t.setUTCDate(t.getUTCDate() + 1);
  return day === t.toISOString().slice(0, 10) ? 'Tomorrow' : dayShort(day);
}
/** For a sentence: "today" · "tomorrow" · "on Thursday". */
const onDay = (day: string, today: string) => {
  const l = dayLabel(day, today);
  return l === 'Today' || l === 'Tomorrow' ? l.toLowerCase() : `on ${fmt(day, { weekday: 'long' })}`;
};
/** A film's date line: "Arrived" once it's out, else the day. */
export const filmDay = (f: NewFilm, today: string) => (f.date < today ? 'Arrived' : dayLabel(f.date, today));

export function Kicker({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('type-kicker text-muted-foreground', className)}>{children}</p>;
}

/** Films grouped into From your watchlist · Out now · This week · Next week · Later. */
export function filmGroups(feed: NewFeed): { label: string; films: NewFilm[] }[] {
  const e1 = asDate(feed.today);
  e1.setUTCDate(e1.getUTCDate() + 6);
  const e2 = new Date(e1);
  e2.setUTCDate(e2.getUTCDate() + 7);
  const w1 = e1.toISOString().slice(0, 10);
  const w2 = e2.toISOString().slice(0, 10);
  const rest = feed.films.filter((f) => !f.pinned);
  return [
    { label: 'From your watchlist', films: feed.films.filter((f) => f.pinned) },
    { label: 'Out now', films: rest.filter((f) => f.date < feed.today) },
    { label: 'This week', films: rest.filter((f) => f.date >= feed.today && f.date <= w1) },
    { label: 'Next week', films: rest.filter((f) => f.date > w1 && f.date <= w2) },
    { label: 'Later', films: rest.filter((f) => f.date > w2) },
  ].filter((g) => g.films.length);
}

/** One honest line about the week: what of theirs opens, what of theirs airs. */
export function weekSummary(feed: NewFeed): string | null {
  const end = feed.days[feed.days.length - 1];
  const pinned = feed.films.filter((f) => f.pinned && f.date >= feed.today && f.date <= end);
  const myEps = feed.channels.flatMap((c) => c.shows.filter((s) => s.mine).flatMap((s) => s.episodes.map((e) => ({ s, e }))));
  const finale = myEps.find((x) => x.e.flag === 'finale');
  const premiere = myEps.find((x) => x.e.flag === 'premiere');
  const drop = feed.channels
    .filter((c) => c.streaming && !c.elsewhere)
    .flatMap((c) => c.shows)
    .find((s) => s.episodes.some((e) => e.count > 1 || e.flag === 'premiere'));
  const parts = [
    pinned.length ? `${pinned.length} ${pinned.length === 1 ? 'film' : 'films'} you saved ${pinned.length === 1 ? 'opens' : 'open'} this week` : null,
    myEps.length ? `${myEps.length} new ${myEps.length === 1 ? 'episode' : 'episodes'} of your shows` : null,
    finale
      ? `${finale.s.title} finale ${onDay(finale.e.date, feed.today)}`
      : premiere
        ? `${premiere.s.title} premieres ${onDay(premiere.e.date, feed.today)}`
        : drop
          ? `${drop.title} drops ${onDay(drop.episodes[0].date, feed.today)}`
          : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

const WHERE_STYLE: Record<NewFilm['kind'], string> = {
  cinema: 'border-white/60 text-white',
  limited: 'border-dashed border-white/50 text-white/80',
  digital: 'border-white/25 text-white/70',
};

/** Where it reaches you, as text (and a logo for a service), never colour alone. */
export function WhereTag({ film, className }: { film: NewFilm; className?: string }) {
  const onService = film.kind === 'digital' && film.service;
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1.5 rounded border px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.16em]', onService ? 'border-primary bg-primary/15 text-white' : WHERE_STYLE[film.kind], className)}>
      {film.serviceLogo && (
        <span className="relative h-4 w-4 overflow-hidden rounded-[3px]">
          <Image src={film.serviceLogo} alt="" fill sizes="16px" />
        </span>
      )}
      {film.where}
    </span>
  );
}

// ---------------------------------------------------------------------------
// The Arrivals board
// ---------------------------------------------------------------------------

/** Boards whose letters already flipped this visit (so tab switches don't replay them). */
const played = new Set<string>();
const BoardCtx = createContext<{ play: boolean; still: boolean }>({ play: false, still: true });

/**
 * Split-flap letters: each tile turns over when the board first scrolls into
 * view, once per board per visit (no turning with reduced motion). Hidden
 * from screen readers: the row's label carries the words.
 */
export function FlapLetters({ text, delay = 0 }: { text: string; delay?: number }) {
  const { play, still } = useContext(BoardCtx);
  return (
    <span aria-hidden className={cn('whitespace-nowrap', !still && !play && 'opacity-0')}>
      {text.split('').map((ch, i) =>
        ch === ' ' ? (
          <span key={i} className="inline-block w-[0.35em]" />
        ) : (
          <span
            key={i}
            className={cn(
              // A tile: a pale top leaf, a dark bottom leaf, the hinge between.
              'mx-[0.5px] inline-block rounded-[2px] bg-[linear-gradient(to_bottom,rgb(255_255_255/0.09)_0,rgb(255_255_255/0.09)_49%,rgb(0_0_0/0.9)_49%,rgb(0_0_0/0.9)_52%,rgb(255_255_255/0.05)_52%)] px-[0.05em]',
              play && 'animate-[board-flap_420ms_cubic-bezier(0.3,0.9,0.3,1)_both]',
            )}
            style={play ? { animationDelay: `${delay + Math.min(i, 18) * 30}ms` } : undefined}
          >
            {ch}
          </span>
        ),
      )}
    </span>
  );
}

/** The black board: ruled rows on a ring. */
export function Board({ id, children, caption, className }: { id: string; children: ReactNode; caption?: ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const [play, setPlay] = useState(false);
  const still = !!reduce || (!play && played.has(id));
  useEffect(() => {
    if (still || play) return;
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        played.add(id);
        setPlay(true);
        io.disconnect();
      },
      { rootMargin: '0px 0px -8% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [id, play, still]);

  return (
    <BoardCtx.Provider value={{ play: play && !reduce, still }}>
      <div ref={ref} className={cn('rounded-xl bg-black p-1.5 ring-1 ring-border', className)}>
        {caption && <div className="flex items-center justify-between gap-3 px-3 pb-1.5 pt-2 font-mono text-[10px] uppercase tracking-[0.2em] text-white/50">{caption}</div>}
        <ul className="flex flex-col">{children}</ul>
        <style>{'@keyframes board-flap{0%{opacity:0;transform:perspective(200px) rotateX(-90deg)}55%{opacity:1;transform:perspective(200px) rotateX(18deg)}100%{opacity:1;transform:none}}'}</style>
      </div>
    </BoardCtx.Provider>
  );
}

type RowHandlers = { hover: (key: string | null) => void; set: (key: string | null) => void };

/**
 * One film on the board: DUE · TITLE · DIRECTOR · PLATFORM. Pointing at it
 * (a beat of hover), focusing it from the keyboard, or tapping it opens it:
 * the date slides up above the title, the director drops in below, the
 * poster comes in from the left, the film's still lights the row from
 * behind, and the synopsis and a ticket stub to the title page appear.
 */
export function FilmRow({ film, today, index, open, on }: { film: NewFilm; today: string; index: number; open: boolean; on: RowHandlers }) {
  const reduce = useReducedMotion();
  const pointer = useRef<string>('mouse');
  const date = filmDay(film, today);
  const lastName = film.director?.split(' ').slice(-1)[0] ?? null;
  const t = reduce ? { duration: 0 } : { type: 'spring' as const, stiffness: 420, damping: 38 };
  const panelId = `film-${film.key}`;

  return (
    <li className={cn('relative border-b border-white/10 last:border-0', open && 'z-10')} onMouseEnter={() => on.hover(film.key)}>
      {film.pinned && <span aria-hidden className="absolute inset-y-2 left-0 z-10 w-1 rounded-full bg-primary" />}

      {/* The still behind the row, lit on open. */}
      {film.backdrop && (
        <span aria-hidden className={cn('pointer-events-none absolute inset-0 overflow-hidden rounded-lg transition-opacity duration-500', open ? 'opacity-100' : 'opacity-0')}>
          {open && <Image src={film.backdrop} alt="" fill sizes="(min-width: 1024px) 900px, 100vw" className="object-cover" />}
          <span className="absolute inset-0 bg-linear-to-r from-black via-black/80 to-black/35" />
        </span>
      )}

      <div className="relative flex gap-4 px-4 py-3 sm:py-2.5">
        <AnimatePresence initial={false}>
          {open && film.poster && (
            <motion.span
              key="poster"
              aria-hidden
              initial={reduce ? false : { opacity: 0, width: 0, marginRight: -16 }}
              animate={{ opacity: 1, width: 104, marginRight: 0 }}
              exit={reduce ? undefined : { opacity: 0, width: 0, marginRight: -16 }}
              transition={t}
              className="relative aspect-[2/3] shrink-0 self-start overflow-hidden rounded-md ring-1 ring-white/10"
            >
              <Image src={film.poster} alt="" fill sizes="104px" className="object-cover" />
            </motion.span>
          )}
        </AnimatePresence>

        <div className="min-w-0 flex-1">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={panelId}
            onPointerDown={(e) => (pointer.current = e.pointerType)}
            onClick={() => on.set(pointer.current === 'mouse' ? film.key : open ? null : film.key)}
            onFocus={(e) => e.currentTarget.matches(':focus-visible') && on.set(film.key)}
            aria-label={`${dayLong(film.date)}: ${film.title}${film.director ? `, directed by ${film.director}` : ''}, ${film.where}${film.pinned ? ', on your watchlist' : ''}`}
            className={cn(
              'grid w-full cursor-pointer items-center gap-x-4 gap-y-1 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-black',
              open ? 'grid-cols-[minmax(0,1fr)_auto]' : 'grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[8rem_minmax(0,1fr)_auto]',
            )}
          >
            {/* The date: beside the title, then up above it. */}
            <motion.span layout="position" transition={t} className={cn('type-display order-1 text-white/60', open ? 'text-base text-primary' : 'text-sm sm:text-2xl')}>
              <FlapLetters text={date.toUpperCase()} delay={index * 40} />
            </motion.span>
            <motion.span layout="position" transition={t} className={cn('order-3 col-span-2 flex min-w-0 items-baseline gap-3', !open && 'sm:order-2 sm:col-span-1')}>
              <span className={cn('type-display text-white', open ? 'text-3xl leading-[0.95] sm:text-4xl' : 'truncate text-2xl sm:text-3xl')}>
                <FlapLetters text={film.title.toUpperCase()} delay={index * 40 + 60} />
              </span>
              {!open && lastName && <span className="type-display hidden truncate text-xl text-white/45 md:inline">{lastName.toUpperCase()}</span>}
            </motion.span>
            {/* The director: down below the title once open. */}
            {open && film.director && (
              <motion.span initial={reduce ? false : { opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={t} className="type-display order-4 col-span-2 text-lg text-white/55">
                {`Directed by ${film.director}`.toUpperCase()}
              </motion.span>
            )}
            <WhereTag film={film} className={cn('order-2 justify-self-end', !open && 'sm:order-3')} />
          </button>

          {/* The synopsis and the ticket through. */}
          <AnimatePresence initial={false}>
            {open && (
              <motion.div
                id={panelId}
                key="panel"
                initial={reduce ? false : { height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={reduce ? undefined : { height: 0, opacity: 0 }}
                transition={t}
                className="overflow-hidden"
              >
                <div className="flex flex-col gap-3 pb-1 pt-3 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
                  {film.overview ? <p className="line-clamp-3 max-w-2xl text-sm leading-relaxed text-white/75">{film.overview}</p> : <p className="text-sm text-white/45">No synopsis yet.</p>}
                  <TicketStub film={film} date={date} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </li>
  );
}

/** Go to page (primary) and Quick View. `onLight` for a pale surface (the stub, the marquee). */
export function FilmLinks({ film, onLight = false }: { film: NewFilm; onLight?: boolean }) {
  return (
    <>
      <Link
        href={`/title/movie/${film.tmdbId}`}
        className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3.5 text-sm font-semibold text-primary-foreground hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-black"
      >
        Go to page <ArrowRight size={14} aria-hidden />
      </Link>
      <QuickViewLink
        mediaType="movie"
        titleId={film.tmdbId}
        className={cn(
          'inline-flex h-9 items-center gap-1.5 rounded-md border px-3.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          onLight ? 'border-black/20 text-black hover:bg-black/5' : 'border-white/20 text-white hover:bg-white/10',
        )}
      >
        <Maximize2 size={13} aria-hidden /> Quick View
      </QuickViewLink>
    </>
  );
}

/** The way through, issued as a ticket stub torn along a perforation. */
function TicketStub({ film, date }: { film: NewFilm; date: string }) {
  return (
    <div className="relative flex shrink-0 flex-col gap-2.5 self-start rounded-md bg-white py-3 pl-5 pr-3 text-black sm:self-end">
      <span aria-hidden className="absolute inset-y-2 left-2 border-l-2 border-dashed border-black/25" />
      <span aria-hidden className="absolute -left-1.5 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-black" />
      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-black/60">
        Admit one · {date} · {film.kind === 'digital' ? (film.service ?? 'At home') : 'Cinemas'}
      </span>
      <span className="flex flex-wrap gap-2">
        <FilmLinks film={film} onLight />
      </span>
    </div>
  );
}

/**
 * One open row per board. Hover opens after a short beat (so sweeping the
 * pointer down the board doesn't flap every row open); leaving the board
 * closes it. Keyboard focus and taps open at once.
 */
function useOpenRow() {
  const [open, setOpen] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  const clear = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => clear, []);
  const on: RowHandlers = {
    hover: (key) => {
      clear();
      if (key === open) return;
      timer.current = window.setTimeout(() => setOpen(key), key ? 170 : 220);
    },
    set: (key) => {
      clear();
      setOpen(key);
    },
  };
  return { open, on, leave: () => on.hover(null) };
}

/** The board of films, its groups ruled off inside it. */
export function FilmBoard({ id, groups, today, caption }: { id: string; groups: { label: string; films: NewFilm[] }[]; today: string; caption?: ReactNode }) {
  const { open, on, leave } = useOpenRow();
  const starts = groups.map((_, gi) => groups.slice(0, gi).reduce((n, g) => n + g.films.length, 0));
  return (
    <div onMouseLeave={leave}>
      <Board id={id} caption={caption}>
        {groups.map((g, gi) => [
          <li key={`h-${g.label}`} className="flex items-center gap-3 px-4 pb-1 pt-4 font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-white/45">
            {g.label}
            <span aria-hidden className="h-px flex-1 bg-white/10" />
            <span>{g.films.length}</span>
          </li>,
          ...g.films.map((f, fi) => <FilmRow key={f.key} film={f} today={today} index={starts[gi] + fi} open={open === f.key} on={on} />),
        ])}
      </Board>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The Timetable (TV)
// ---------------------------------------------------------------------------

export function EpisodeLabel({ e, showName }: { e: NewEpisode; showName: boolean }) {
  return (
    <span className="flex flex-col gap-0.5">
      <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1 font-mono text-[11px] font-semibold uppercase tracking-wider text-foreground">
        <span className="whitespace-nowrap">{e.count > 1 ? `S${e.season} · ${e.count} eps` : `S${e.season}·E${e.episode}`}</span>
        {e.flag && <span className="rounded-sm bg-primary px-1 py-px text-[9px] text-primary-foreground">{e.flag === 'premiere' ? 'Premiere' : 'Finale'}</span>}
      </span>
      {e.count > 1 ? (
        <span className="text-[11px] text-muted-foreground">
          Episodes {e.episode}–{e.episode + e.count - 1}
        </span>
      ) : (
        showName && e.name && <span className="line-clamp-1 text-[11px] text-muted-foreground">{e.name}</span>
      )}
    </span>
  );
}

/** Spoiler guard: episode titles stay hidden until asked for. */
export function useEpisodeNames() {
  const [show, setShow] = useState(false);
  const toggle = (
    <button
      type="button"
      onClick={() => setShow((s) => !s)}
      aria-pressed={show}
      className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {show ? <EyeOff size={14} aria-hidden /> : <Eye size={14} aria-hidden />}
      {show ? 'Hide episode titles' : 'Show episode titles'}
    </button>
  );
  return { show, toggle };
}

export function ChannelBadge({ ch, size = 'md' }: { ch: Pick<NewChannel, 'name' | 'logo'>; size?: 'sm' | 'md' }) {
  return (
    <span className={cn('flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-white p-1', size === 'sm' ? 'h-7 w-12' : 'h-10 w-16')}>
      {ch.logo ? (
        <span className="relative h-full w-full">
          <Image src={ch.logo} alt={ch.name} fill sizes="64px" className="object-contain" />
        </span>
      ) : (
        <span className="truncate px-1 text-[10px] font-bold text-black">{ch.name}</span>
      )}
    </span>
  );
}

/** "HBO · US dates" for a channel from another country; the name alone otherwise. */
const channelLine = (ch: NewChannel) => (ch.elsewhere ? `${ch.name} · ${ch.elsewhere} dates` : ch.name);

type GuideRow = { ch: NewChannel; s: NewShow };
type GuideSection = { label: string; note?: string; rows: GuideRow[] };

/** Your shows · Streaming · On TV · Air dates abroad. */
export function guideSections(feed: NewFeed): GuideSection[] {
  const all = feed.channels.flatMap((ch) => ch.shows.map((s) => ({ ch, s })));
  const rest = all.filter((r) => !r.s.mine);
  return [
    { label: 'Your shows', rows: all.filter((r) => r.s.mine) },
    { label: 'Streaming', rows: rest.filter((r) => r.ch.streaming && !r.ch.elsewhere) },
    { label: 'On TV', rows: rest.filter((r) => !r.ch.streaming && !r.ch.elsewhere) },
    { label: 'Air dates abroad', note: `Dates are the channel's own; it may air later in ${getCountryName(feed.region) ?? feed.region}`, rows: rest.filter((r) => r.ch.elsewhere) },
  ].filter((g) => g.rows.length);
}

/**
 * The Timetable: channels down, the week across, in sections. A block is a
 * show's episode on its day; a season dropping at once is one block. The
 * show's still lights its block on hover. Arrow keys move through the cells
 * (roving tabindex); Enter opens Quick View.
 */
export function GuideGrid({ feed, showNames }: { feed: NewFeed; showNames: boolean }) {
  const sections = useMemo(() => guideSections(feed), [feed]);
  const total = sections.reduce((n, s) => n + s.rows.length, 0);
  const [focus, setFocus] = useState<[number, number]>([0, 0]);

  const move = (e: React.KeyboardEvent, r: number, c: number) => {
    const map: Record<string, [number, number]> = { ArrowRight: [r, c + 1], ArrowLeft: [r, c - 1], ArrowDown: [r + 1, c], ArrowUp: [r - 1, c], Home: [r, 0], End: [r, feed.days.length - 1] };
    const to = map[e.key];
    if (!to) return;
    e.preventDefault();
    const [nr, nc] = [Math.max(0, Math.min(total - 1, to[0])), Math.max(0, Math.min(feed.days.length - 1, to[1]))];
    setFocus([nr, nc]);
    (document.querySelector(`[data-cell="${nr}-${nc}"]`) as HTMLElement | null)?.focus();
  };

  if (!total) {
    return <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Nothing new on air this week in {feed.region}. Follow a show and its episodes land here.</p>;
  }

  const starts = sections.map((_, si) => sections.slice(0, si).reduce((n, s) => n + s.rows.length, 0));
  return (
    <div className="overflow-x-auto rounded-xl border border-border [scrollbar-width:thin]">
      <div role="grid" aria-label="TV timetable, this week" className="grid min-w-[880px]" style={{ gridTemplateColumns: `12rem repeat(${feed.days.length}, minmax(7rem, 1fr))` }}>
        <div role="row" className="contents">
          <div role="columnheader" className="sticky left-0 z-20 border-b border-border bg-card px-3 py-2.5 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            Channel
          </div>
          {feed.days.map((d) => (
            <div key={d} role="columnheader" className={cn('border-b border-l border-border px-3 py-2.5 font-mono text-[11px] font-semibold uppercase tracking-wider', d === feed.today ? 'border-t-2 border-t-primary bg-primary/10 text-foreground' : 'bg-card text-muted-foreground')}>
              <time dateTime={d}>{dayLabel(d, feed.today)}</time>
            </div>
          ))}
        </div>
        {sections.map((sec, si) => (
          <div key={sec.label} role="rowgroup" className="contents">
            <div role="row" className="contents">
              <div role="rowheader" className="col-span-full flex items-center gap-3 border-b border-border bg-background px-3 pb-1.5 pt-4 font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                <span className="sticky left-3 flex items-baseline gap-3">
                  {sec.label}
                  <span className="text-muted-foreground/60">{sec.rows.length}</span>
                  {sec.note && <span className="font-sans text-[11px] font-normal normal-case tracking-normal text-muted-foreground/80">{sec.note}</span>}
                </span>
              </div>
            </div>
            {sec.rows.map(({ ch, s }, ri) => {
              const row = starts[si] + ri;
              return (
                <div key={s.key} role="row" className="contents">
                  <div role="rowheader" className={cn('sticky left-0 z-10 flex items-center gap-2.5 border-b border-border bg-card px-3 py-2', s.mine && 'shadow-[inset_3px_0_0_var(--primary)]')}>
                    <ChannelBadge ch={ch} size="sm" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-foreground">{s.title}</span>
                      <span className="block truncate font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">{channelLine(ch)}</span>
                    </span>
                  </div>
                  {feed.days.map((d, c) => {
                    const e = s.episodes.find((x) => x.date === d);
                    const tab = focus[0] === row && focus[1] === c ? 0 : -1;
                    return (
                      <div key={d} role="gridcell" className={cn('border-b border-l border-border p-1', d === feed.today && 'bg-primary/[0.06]')}>
                        {e ? (
                          <QuickViewLink
                            mediaType="tv"
                            titleId={s.tmdbId}
                            data-cell={`${row}-${c}`}
                            tabIndex={tab}
                            onKeyDown={(ev: React.KeyboardEvent) => move(ev, row, c)}
                            onFocus={() => setFocus([row, c])}
                            aria-label={`${s.title} on ${channelLine(ch)}, ${dayLong(d)}, ${e.count > 1 ? `${e.count} episodes` : `season ${e.season} episode ${e.episode}`}${e.flag ? `, ${e.flag}` : ''}`}
                            className={cn(
                              'group relative flex h-full min-h-14 overflow-hidden rounded-md border px-2.5 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                              s.mine ? 'border-primary/50 bg-secondary hover:bg-secondary/80' : 'border-border bg-background hover:bg-secondary/60',
                            )}
                          >
                            {s.backdrop && <Image src={s.backdrop} alt="" fill sizes="160px" className="object-cover opacity-10 transition-opacity duration-500 group-hover:opacity-55 group-focus-visible:opacity-55" />}
                            <span aria-hidden className="absolute inset-0 bg-linear-to-t from-black/85 to-black/10 opacity-0 transition-opacity duration-500 group-hover:opacity-100 group-focus-visible:opacity-100" />
                            <span className="relative">
                              <EpisodeLabel e={e} showName={showNames} />
                            </span>
                          </QuickViewLink>
                        ) : (
                          <span
                            data-cell={`${row}-${c}`}
                            tabIndex={tab}
                            onKeyDown={(ev) => move(ev, row, c)}
                            onFocus={() => setFocus([row, c])}
                            aria-label={`${s.title}, ${dayLong(d)}: no new episode`}
                            className="flex h-full min-h-14 items-center justify-center rounded-md text-muted-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <span aria-hidden>—</span>
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Phones: one day at a time, a vertical list in the same sections (no 2D scrolling). */
export function GuideByDay({ feed, showNames }: { feed: NewFeed; showNames: boolean }) {
  const [day, setDay] = useState(feed.today);
  const sections = guideSections(feed)
    .map((sec) => ({ ...sec, rows: sec.rows.flatMap((row) => row.s.episodes.filter((e) => e.date === day).map((e) => ({ ...row, e }))) }))
    .filter((sec) => sec.rows.length);
  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label="Day" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
        {feed.days.map((d) => (
          <button
            key={d}
            role="tab"
            aria-selected={d === day}
            onClick={() => setDay(d)}
            className={cn('shrink-0 cursor-pointer rounded-md border px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider', d === day ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground')}
          >
            {dayLabel(d, feed.today)}
          </button>
        ))}
      </div>
      {sections.length ? (
        sections.map((sec) => (
          <section key={sec.label} className="flex flex-col gap-1.5" aria-label={sec.label}>
            <Kicker>{sec.label}</Kicker>
            {sec.note && <p className="-mt-1 text-xs text-muted-foreground">{sec.note}</p>}
            <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
              {sec.rows.map(({ ch, s, e }) => (
                <li key={s.key}>
                  <QuickViewLink mediaType="tv" titleId={s.tmdbId} className={cn('flex items-center gap-3 px-3 py-2.5 hover:bg-secondary/50', s.mine && 'shadow-[inset_3px_0_0_var(--primary)]')}>
                    <ChannelBadge ch={ch} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{s.title}</span>
                      {ch.elsewhere && <span className="block truncate font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">{channelLine(ch)}</span>}
                      <EpisodeLabel e={e} showName={showNames} />
                    </span>
                  </QuickViewLink>
                </li>
              ))}
            </ul>
          </section>
        ))
      ) : (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No new episodes {dayLabel(day, feed.today).toLowerCase()}.</p>
      )}
    </div>
  );
}

/** The Timetable, responsive: the grid on md+, one day at a time on phones. */
export function Guide({ feed, showNames }: { feed: NewFeed; showNames: boolean }) {
  return (
    <>
      <div className="hidden md:block">
        <GuideGrid feed={feed} showNames={showNames} />
      </div>
      <div className="md:hidden">
        <GuideByDay feed={feed} showNames={showNames} />
      </div>
    </>
  );
}
