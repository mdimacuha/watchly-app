'use client';

// One title in the For You reel: the centred trailer with its caption bar,
// details lower-left that open in place ("More about it"), and the action
// stack lower-right. Nothing is ever drawn on top of the YouTube player, and
// the player itself stays YouTube's: our taps and gestures live around it.

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowUpRight, Bookmark, BookmarkCheck, ChevronDown, Heart, Pause, Play, Volume1, Volume2, VolumeX } from 'lucide-react';
import { cn } from '@/lib/cn';
import { buildImageUrl } from '@/lib/tmdb';
import { useRegionStore } from '@/client/stores/region';
import { AvailabilityStrip } from '@/components/title/AvailabilityStrip';
import { toAvailability, type Availability } from '@/components/title/useTitleAvailability';
import type { ReelItem } from '@/services/forYou/reel';
import type { CrewPerson, TitlePagePayload } from '@/services/tmdb/title';
import type { ReelCardProps } from './ReelFeed';
import { YouTubeBand, YouTubeLogo } from './YouTubeBand';

/** Seconds of studio logos to skip, by video type. */
const LOGO_SKIP: Record<string, number> = { Trailer: 8, Teaser: 5 };
const typeLabel = (item: ReelItem) => (item.mediaType === 'tv' ? 'Series' : 'Film');
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
/** Two taps within this window and this distance are a double tap. */
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_PX = 30;
/** Hearts keep at least this far from the video (a heart is 80px across). */
const HEART_CLEARANCE_PX = 48;
/** YouTube's minimum player viewport is 200 × 200. */
const MIN_PLAYER_PX = 200;

export function ReelCard(p: ReelCardProps) {
  const { item } = p;
  const [open, setOpen] = useState(false);
  const toggleOpen = () => {
    if (!open) p.onDetailsOpened();
    setOpen(!open);
  };
  const taps = useTaps(p.togglePlay, p.likeByTap, p.userPaused);

  return (
    <section
      aria-label={item.title}
      onPointerUp={taps.handler}
      className="theme-dark relative isolate flex h-full touch-manipulation flex-col"
    >
      <HeartBursts bursts={taps.bursts} onDone={taps.clear} />
      <PosterBlur item={item} />
      <div className={cn('flex flex-col justify-center pt-4 transition-[flex-grow] duration-300 ease-out', open ? 'grow-0' : 'grow')}>
        <Band p={p} />
        <CaptionBar p={p} />
      </div>
      <div className={cn('flex min-h-0 items-end gap-4 px-4 pb-5', open && 'grow')}>
        <div
          data-no-double-tap={open || undefined}
          className={cn(
            'min-w-0 flex-1 space-y-1.5',
            open && 'max-h-full self-stretch overflow-y-auto overscroll-contain pt-3 [scrollbar-width:thin]',
          )}
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">{item.reason}</p>
          <h2 className="text-xl font-bold leading-tight">{item.title}</h2>
          <Meta item={item} />
          {item.overview && <p className={cn('text-sm text-foreground/85', !open && 'line-clamp-2')}>{item.overview}</p>}
          {open && <MoreAboutIt item={item} />}
          <button
            type="button"
            onClick={toggleOpen}
            aria-expanded={open}
            className="text-xs font-semibold text-foreground underline-offset-2 hover:underline cursor-pointer"
          >
            {open ? 'Less' : 'More about it'}
          </button>
        </div>
        <ActionStack p={p} />
      </div>
      {p.hint && !open && (
        <p className="flex items-center justify-center gap-1 pb-2 text-[11px] text-muted-foreground motion-safe:animate-bounce">
          <ChevronDown className="h-3.5 w-3.5" /> Swipe up for the next one
        </p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Tap the card to pause or play; double tap to like. A single tap waits out
// the double-tap window so a like never also pauses. Taps on controls, links
// and the open details don't count, and neither does the video: the playing
// player is YouTube's own (a tap there is theirs). Paused, our still sits in
// its place, and a tap on it plays. Hearts never land on or near the video.
// ---------------------------------------------------------------------------

type Burst = { id: number; x: number; y: number };

function useTaps(onTap: () => void, onDoubleTap: () => void, paused: boolean) {
  const last = useRef<{ at: number; x: number; y: number } | null>(null);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [bursts, setBursts] = useState<Burst[]>([]);
  const onTapRef = useRef(onTap);
  const pausedRef = useRef(paused);
  useEffect(() => {
    onTapRef.current = onTap;
    pausedRef.current = paused;
  });
  useEffect(() => () => clearTimeout(pending.current ?? undefined), []);

  const handler = (e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    const t = e.target instanceof Element ? e.target : null;
    if (t?.closest('button, a, input, [data-no-double-tap]')) return;
    if (t?.closest('[data-video]')) {
      // Only our paused still is ever here to tap (the player swallows its own taps).
      if (pausedRef.current) onTapRef.current();
      return;
    }
    const now = e.timeStamp;
    const prev = last.current;
    if (prev && now - prev.at < DOUBLE_TAP_MS && Math.hypot(e.clientX - prev.x, e.clientY - prev.y) < DOUBLE_TAP_PX) {
      last.current = null;
      clearTimeout(pending.current ?? undefined);
      pending.current = null;
      // A mouse double click also selects the word under it.
      window.getSelection()?.removeAllRanges();
      onDoubleTap();
      const video = e.currentTarget.querySelector('[data-video]')?.getBoundingClientRect();
      const nearVideo =
        !!video &&
        e.clientX > video.left - HEART_CLEARANCE_PX &&
        e.clientX < video.right + HEART_CLEARANCE_PX &&
        e.clientY > video.top - HEART_CLEARANCE_PX &&
        e.clientY < video.bottom + HEART_CLEARANCE_PX;
      if (!nearVideo) {
        const box = e.currentTarget.getBoundingClientRect();
        setBursts((cur) => [...cur.slice(-2), { id: now, x: e.clientX - box.left, y: e.clientY - box.top }]);
      }
      return;
    }
    last.current = { at: now, x: e.clientX, y: e.clientY };
    clearTimeout(pending.current ?? undefined);
    pending.current = setTimeout(() => {
      pending.current = null;
      onTapRef.current();
    }, DOUBLE_TAP_MS);
  };

  const clear = (id: number) => setBursts((cur) => cur.filter((b) => b.id !== id));
  return { handler, bursts, clear };
}

function HeartBursts({ bursts, onDone }: { bursts: Burst[]; onDone: (id: number) => void }) {
  return (
    <>
      {bursts.map((b) => (
        <Heart
          key={b.id}
          aria-hidden
          onAnimationEnd={() => onDone(b.id)}
          style={{ left: b.x, top: b.y }}
          className="pointer-events-none absolute z-20 h-20 w-20 -translate-x-1/2 -translate-y-1/2 fill-primary text-primary drop-shadow-lg motion-safe:animate-[reel-heart_700ms_ease-out_both] motion-reduce:animate-[reel-fade_500ms_ease-out_both]"
        />
      ))}
      <style>
        {'@keyframes reel-heart{0%{opacity:0;transform:translate(-50%,-50%) scale(.4) rotate(-12deg)}20%{opacity:1;transform:translate(-50%,-50%) scale(1.15) rotate(-12deg)}35%{transform:translate(-50%,-50%) scale(.95) rotate(-12deg)}75%{opacity:1;transform:translate(-50%,-60%) scale(1) rotate(-12deg)}100%{opacity:0;transform:translate(-50%,-90%) scale(.9) rotate(-12deg)}}' +
          '@keyframes reel-fade{0%,60%{opacity:1}100%{opacity:0}}' +
          '@keyframes reel-pop{0%{transform:scale(1)}40%{transform:scale(1.35)}100%{transform:scale(1)}}'}
      </style>
    </>
  );
}

// ---------------------------------------------------------------------------
// More about it: where to watch (with region switch), who made it, and the
// way to the full title page. Loaded on first open, refreshed per region.
// ---------------------------------------------------------------------------

function MoreAboutIt({ item }: { item: ReelItem }) {
  const { availability, makers } = useTitleExtras(item);
  return (
    <div className="space-y-3 pt-2">
      <AvailabilityStrip availability={availability} stacked />
      {makers.length > 0 && (
        <dl className="space-y-1 text-sm">
          {makers.map(({ label, people }) => (
            <div key={label} className="flex gap-2">
              <dt className="shrink-0 text-muted-foreground">{label}</dt>
              <dd className="min-w-0">
                {people.map((person, i) => (
                  <span key={person.id}>
                    {i > 0 && ', '}
                    <Link href={`/artist/${person.id}`} className="font-medium hover:underline">
                      {person.name}
                    </Link>
                  </span>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {item.genres.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {item.genres.map((g) => (
            <span key={g} className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
              {g}
            </span>
          ))}
        </div>
      )}
      <Link
        href={`/title/${item.mediaType}/${item.tmdbId}`}
        className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium hover:bg-secondary/60"
      >
        <ArrowUpRight className="h-4 w-4" /> Go to page
      </Link>
    </div>
  );
}

function useTitleExtras(item: ReelItem): { availability: Availability; makers: { label: string; people: CrewPerson[] }[] } {
  const regionCode = useRegionStore((s) => s.regionCode);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ for: string; data: TitlePagePayload | null }>({ for: '', data: null });
  const want = `${regionCode}:${attempt}`;

  useEffect(() => {
    let cancelled = false;
    const q = regionCode ? `?region=${encodeURIComponent(regionCode)}` : '';
    fetch(`/api/v1/titles/${item.mediaType}/${item.tmdbId}${q}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((json) => {
        if (!json?.ok || !json.data) throw new Error('bad payload');
        if (!cancelled) setResult({ for: want, data: json.data as TitlePagePayload });
      })
      .catch(() => {
        if (!cancelled) setResult({ for: want, data: null });
      });
    return () => {
      cancelled = true;
    };
  }, [item.mediaType, item.tmdbId, regionCode, want]);

  const data = result.for === want ? result.data : undefined;
  const availability: Availability =
    data === undefined
      ? { status: 'loading' }
      : data === null
        ? { status: 'error', retry: () => setAttempt((n) => n + 1) }
        : toAvailability(data);

  const crew = data?.infoPanelData.keyCrew;
  const makers = crew
    ? [
        { label: 'Created by', people: crew.creators.slice(0, 3) },
        { label: crew.directors.length > 1 ? 'Directors' : 'Director', people: crew.directors.slice(0, 3) },
      ].filter((m) => m.people.length > 0)
    : [];
  return { availability, makers };
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

/** Inside the card: the poster, heavily blurred under a 60% black. */
function PosterBlur({ item }: { item: ReelItem }) {
  const src = buildImageUrl(item.posterPath ?? item.backdropPath, 'w342');
  return (
    <div aria-hidden className="absolute inset-0 -z-10 overflow-hidden bg-black">
      {src && <Image src={src} alt="" fill sizes="400px" className="scale-125 object-cover blur-2xl" />}
      <div className="absolute inset-0 bg-black/60" />
    </div>
  );
}

/** The video band: our still when the player isn't showing, otherwise the player alone. */
function Band({ p }: { p: ReelCardProps }) {
  const still = buildImageUrl(p.item.backdropPath ?? p.item.posterPath, 'w780');
  const playing = p.player === 'play';
  return (
    // 16:9, but never under YouTube's 200px minimum (narrow phones, short
    // windows): the player letterboxes inside the taller band.
    <div data-video className="relative aspect-video w-full overflow-hidden bg-black" style={{ minHeight: MIN_PLAYER_PX }}>
      {!playing && still && <Image src={still} alt="" fill sizes="560px" className="object-cover" />}
      {/* Only a paused card shows an icon. Paused, the player is hidden behind
          our still, so this never sits on top of YouTube's player. */}
      {p.active && p.userPaused && (
        <span
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 z-10 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white shadow-lg"
        >
          <Play className="ml-1 h-7 w-7 fill-current" />
        </span>
      )}
      {/* The next card's player loads early but stays hidden (YouTube's cued
          title card never shows); our still sits in its place, not over it. */}
      {p.player && (
        <div className={cn('absolute inset-0', !playing && 'invisible')}>
          <YouTubeBand
            videoKey={p.item.video.key}
            mode={playing ? 'play' : 'cue'}
            muted={p.muted}
            volume={p.volume}
            start={LOGO_SKIP[p.item.video.type]}
            captions
            onError={p.onVideoError}
            onAutoplayBlocked={p.onAutoplayBlocked}
            // Paused with YouTube's own player: our state follows (still + play).
            onPausedInPlayer={p.togglePlay}
          />
        </div>
      )}
    </div>
  );
}

function RoundButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-foreground/15 bg-background/50 text-foreground hover:bg-secondary cursor-pointer"
    >
      {children}
    </button>
  );
}

/**
 * Mute button plus a volume slider. With a mouse the slider slides out on
 * hover or focus; on touch screens it is always there.
 */
function SoundControl({ p }: { p: ReelCardProps }) {
  const level = p.muted ? 0 : p.volume;
  const Icon = level === 0 ? VolumeX : level < 50 ? Volume1 : Volume2;
  return (
    <div className="group/sound flex shrink-0 items-center">
      <RoundButton label={p.muted ? 'Turn sound on (M)' : 'Turn sound off (M)'} onClick={p.toggleMute}>
        <Icon className="h-4 w-4" />
      </RoundButton>
      <div className="w-24 overflow-hidden transition-[width] duration-200 ease-out [@media(hover:hover)]:w-0 [@media(hover:hover)]:group-focus-within/sound:w-24 [@media(hover:hover)]:group-hover/sound:w-24">
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={level}
          onChange={(e) => p.changeVolume(Number(e.target.value))}
          aria-label="Volume"
          aria-valuetext={level === 0 ? 'Muted' : `${level}%`}
          style={{
            background: `linear-gradient(to right, var(--color-foreground) ${level}%, color-mix(in oklab, var(--color-foreground) 22%, transparent) ${level}%)`,
          }}
          className="mx-3 block h-1 w-[4.5rem] cursor-pointer appearance-none rounded-full focus-visible:outline-none [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-foreground [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-foreground focus-visible:[&::-webkit-slider-thumb]:ring-2 focus-visible:[&::-webkit-slider-thumb]:ring-ring"
        />
      </div>
    </div>
  );
}

/** Sound, what's playing; YouTube mark under the video's corner. */
function CaptionBar({ p }: { p: ReelCardProps }) {
  const { item } = p;
  const skip = LOGO_SKIP[item.video.type];
  return (
    <div className="flex items-center gap-2 px-4 py-2.5">
      <RoundButton label={p.userPaused ? 'Play (Space)' : 'Pause (Space)'} onClick={p.togglePlay}>
        {p.userPaused ? <Play className="ml-0.5 h-3.5 w-3.5 fill-current" /> : <Pause className="h-3.5 w-3.5 fill-current" />}
      </RoundButton>
      <SoundControl p={p} />
      <p className="ml-1 min-w-0 flex-1 truncate text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {item.video.type}
        {skip ? ` · from ${fmt(skip)}` : ''} · CC
      </p>
      <a
        href={`https://www.youtube.com/watch?v=${item.video.key}`}
        target="_blank"
        rel="noopener"
        aria-label="Watch on YouTube"
        className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold tracking-tight text-foreground/90 hover:text-foreground"
      >
        <YouTubeLogo className="h-4 w-auto" /> YouTube
      </a>
    </div>
  );
}

function Meta({ item }: { item: ReelItem }) {
  return (
    <p className="flex flex-wrap items-center gap-x-1.5 text-[13px] text-muted-foreground">
      {item.voteAverage ? (
        <>
          <span className="inline-flex items-center gap-1 font-semibold text-foreground">
            <span className="text-yellow-400" aria-hidden>
              ★
            </span>
            {item.voteAverage.toFixed(1)}
            <span className="sr-only"> out of 10</span>
          </span>
          <span aria-hidden>·</span>
        </>
      ) : null}
      <span>{[item.year, typeLabel(item), ...item.genres.slice(0, 2)].filter(Boolean).join(' · ')}</span>
    </p>
  );
}

/** Watchlist leads; Like beneath it. */
function ActionStack({ p }: { p: ReelCardProps }) {
  return (
    <div className="flex w-32 shrink-0 flex-col gap-2 self-end">
      <button
        type="button"
        onClick={p.openWatchlist}
        aria-pressed={p.inList}
        className={cn(
          'inline-flex h-10 items-center justify-center gap-1.5 rounded-md text-sm font-semibold transition-colors cursor-pointer',
          p.inList ? 'border border-border bg-secondary text-foreground' : 'bg-primary text-primary-foreground hover:bg-primary/90',
        )}
      >
        {p.inList ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
        {p.inList ? 'Saved' : 'Watchlist'}
      </button>
      <button
        type="button"
        onClick={p.toggleLike}
        aria-pressed={p.liked}
        title={p.liked ? 'Unlike (L)' : 'Like (L) · or double tap'}
        className="inline-flex h-10 items-center justify-center gap-1.5 rounded-md border border-border bg-background/60 text-sm font-medium hover:bg-secondary cursor-pointer"
      >
        {/* Remounts on like so the pop replays, however the like was made. */}
        <Heart
          key={p.liked ? 'on' : 'off'}
          className={cn('h-4 w-4', p.liked && 'fill-primary text-primary motion-safe:animate-[reel-pop_350ms_ease-out]')}
        />{' '}
        {p.liked ? 'Liked' : 'Like'}
      </button>
    </div>
  );
}
