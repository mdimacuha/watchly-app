'use client';

// The For You reel: a vertical, snapping feed of trailer cards. Paging,
// snapping, the player window, sound, the blurred surround, tracking and
// the real Like / Watchlist actions live here; ReelCard draws one title.

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ChevronDown, ChevronUp, Clapperboard, Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { buildImageUrl } from '@/lib/tmdb';
import { useUIStore } from '@/client/stores/ui';
import { useToast } from '@/hooks/useToast';
import { flushForYou, trackForYou } from '@/client/forYouEvents';
import { AddToWatchlistPicker } from '@/components/watchlists/AddToWatchlistPicker';
import { EmptyState } from '@/components/watchly/EmptyState';
import { recordSwipeAction, undoSwipeAction } from '@/actions/swipe';
import { getReelPageAction } from '@/actions/forYou';
import type { ReelItem } from '@/services/forYou/reel';
import { ReelCard } from './ReelCard';

export interface ReelCardProps {
  item: ReelItem;
  active: boolean;
  /** Mount a player? play = this card is active, cue = next card (loads hidden), null = still only. */
  player: 'play' | 'cue' | null;
  muted: boolean;
  /** 1..100; the level sound comes back at when unmuted. */
  volume: number;
  changeVolume: (v: number) => void;
  toggleMute: () => void;
  onAutoplayBlocked: () => void;
  /** Paused by a tap on the card (or Space); always true until asked under reduced motion. */
  userPaused: boolean;
  togglePlay: () => void;
  liked: boolean;
  toggleLike: () => void;
  /** Double tap: likes, never unlikes. */
  likeByTap: () => void;
  inList: boolean;
  openWatchlist: () => void;
  onVideoError: () => void;
  onDetailsOpened: () => void;
  /** Show the one-time "swipe up" hint. */
  hint: boolean;
}

/** Start finding more while this many titles are still ahead, so the next page is ready first. */
const PREFETCH_WHEN_AHEAD = 4;
/** Trailers start with sound at half volume (muted if the browser refuses). */
const DEFAULT_VOLUME = 50;
const VOLUME_KEY = 'watchly.reel.volume';
/** How long each surround photo holds before crossfading to the next. */
const SURROUND_HOLD_MS = 7000;
/** Reasons of the last few titles, sent so the next page leads with others. */
const RECENT_REASONS = 6;

const subscribeMotion = (cb: () => void) => {
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
};

// The viewer's volume, remembered on this device (a convenience: storage can
// be blocked, and then it simply starts at the default).
const volumeListeners = new Set<() => void>();
let memoryVolume: number | null = null;
function readVolume(): number {
  try {
    const v = Number(localStorage.getItem(VOLUME_KEY));
    return localStorage.getItem(VOLUME_KEY) !== null && v >= 1 && v <= 100 ? v : DEFAULT_VOLUME;
  } catch {
    return DEFAULT_VOLUME;
  }
}
function writeVolume(v: number) {
  try {
    localStorage.setItem(VOLUME_KEY, String(v));
  } catch {
    // Not remembered; still applies for this visit via the in-memory copy.
  }
  memoryVolume = v;
  volumeListeners.forEach((l) => l());
}
const subscribeVolume = (cb: () => void) => {
  volumeListeners.add(cb);
  return () => volumeListeners.delete(cb);
};

export function ReelFeed({ initial, seed }: { initial: ReelItem[]; seed: string }) {
  const toast = useToast();
  const quickViewOpen = useUIStore((s) => s.quickView !== null);
  const reducedMotion = useSyncExternalStore(
    subscribeMotion,
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    () => false,
  );

  const [items, setItems] = useState(initial);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(initial.length === 0);
  const [muted, setMuted] = useState(false);
  const volume = useSyncExternalStore(subscribeVolume, () => memoryVolume ?? readVolume(), () => DEFAULT_VOLUME);
  // Dragging to 0 mutes; any other level turns sound on at that level.
  const changeVolume = (v: number) => {
    if (v === 0) {
      setMuted(true);
      return;
    }
    writeVolume(v);
    setMuted(false);
  };
  const [liked, setLiked] = useState<Record<string, string>>({});
  const [inList, setInList] = useState<Set<string>>(new Set());
  const [picker, setPicker] = useState<ReelItem | null>(null);
  const [moved, setMoved] = useState(false);
  // A tap toggles play for the card it was made on; moving on resets it.
  // Cards play by default, or start paused under reduced motion.
  const [toggledAt, setToggledAt] = useState<number | null>(null);
  const userPaused = (toggledAt === active) !== reducedMotion;
  const togglePlay = (i: number) => setToggledAt((t) => (t === i ? null : i));
  const scroller = useRef<HTMLDivElement>(null);
  const shownKeys = useRef(new Set(initial.map((i) => i.key)));
  const pickerReported = useRef(false);

  if (active > 0 && !moved) setMoved(true);

  useEffect(() => {
    trackForYou('feed_viewed', undefined, { surface: 'reel', count: initial.length });
  }, [initial.length]);

  // One item_viewed per title, with how long it was on screen. The server
  // rests viewed titles for a while, so a refresh doesn't replay them.
  const viewStart = useRef({ index: 0, at: 0, logged: false });
  useEffect(() => {
    const prev = viewStart.current;
    const prevItem = items[prev.index];
    if (prev.at && prevItem && prev.index !== active && !prev.logged) logView(prevItem, prev.index, prev.at);
    viewStart.current = { index: active, at: Date.now(), logged: false };
    // Only the active index matters; items is read for the outgoing title.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // Leaving the page (refresh, tab switch, close) counts the title on screen
  // too, sent straight away so it's recorded before the next visit loads.
  useEffect(() => {
    const onHide = (e: Event) => {
      if (e.type === 'visibilitychange' && document.visibilityState !== 'hidden') return;
      const cur = viewStart.current;
      const item = items[cur.index];
      if (!item || !cur.at || cur.logged) return;
      logView(item, cur.index, cur.at);
      viewStart.current = { ...cur, logged: true };
      flushForYou();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onHide);
    };
  }, [items]);

  // Active card = the one at least 60% on screen (YouTube: autoplay only when
  // more than half the player is visible). Cards are sticky-stacked, so the
  // observer watches unpinned per-screen markers instead.
  useEffect(() => {
    const root = scroller.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.sentinel));
        }
      },
      { root, threshold: 0.6 },
    );
    root.querySelectorAll('[data-sentinel]').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [items.length, loading, done]);

  // Page in more when few remain, with this visit's seed, skipping what this
  // visit has shown and leading with reasons we haven't just seen.
  const loadingRef = useRef(false);
  const pagesLoaded = useRef(1);
  useEffect(() => {
    if (done || loadingRef.current || items.length - 1 - active > PREFETCH_WHEN_AHEAD) return;
    loadingRef.current = true;
    setLoading(true);
    getReelPageAction({
      seed,
      page: pagesLoaded.current++,
      exclude: [...shownKeys.current].slice(-500),
      recentReasons: items.slice(-RECENT_REASONS).map((i) => i.reason),
    })
      .then(({ items: more }) => {
        const fresh = more.filter((m) => !shownKeys.current.has(m.key));
        fresh.forEach((m) => shownKeys.current.add(m.key));
        if (fresh.length === 0) setDone(true);
        else setItems((cur) => [...cur, ...fresh]);
      })
      .catch(() => setDone(true))
      .finally(() => {
        loadingRef.current = false;
        setLoading(false);
      });
  }, [active, items, done, seed]);

  const goTo = useCallback(
    (i: number) => {
      const el = scroller.current;
      if (!el) return;
      const max = el.querySelectorAll('[data-slide]').length - 1;
      const target = Math.max(0, Math.min(i, max));
      el.scrollTo({ top: target * el.clientHeight, behavior: reducedMotion ? 'auto' : 'smooth' });
    },
    [reducedMotion],
  );

  const toggleLike = (item: ReelItem, position: number, via: 'button' | 'key' | 'double_tap') => {
    const swipeId = liked[item.key];
    if (swipeId) {
      setLiked((cur) => without(cur, item.key));
      void undoSwipeAction({ swipeId, tmdbId: item.tmdbId, mediaType: item.mediaType }).catch(() =>
        toast.error('Could not undo that like'),
      );
      return;
    }
    setLiked((cur) => ({ ...cur, [item.key]: 'pending' }));
    trackForYou('committed', item.key, { surface: 'reel', kind: 'like', position, reason: item.reason, bucket: item.bucket, via });
    recordSwipeAction({ tmdbId: item.tmdbId, mediaType: item.mediaType, action: 'liked', source: 'reel' })
      .then((r) => setLiked((cur) => (item.key in cur ? { ...cur, [item.key]: r.swipeId } : cur)))
      .catch(() => {
        setLiked((cur) => without(cur, item.key));
        toast.error('Could not save that like');
      });
  };

  // Re-registered every render so L always likes the title on screen now.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target instanceof Element ? e.target : null;
      if (t?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]') || picker || quickViewOpen) return;
      if (e.key === 'ArrowDown' || e.key === 'j' || e.key === 'PageDown') {
        e.preventDefault();
        goTo(active + 1);
      } else if (e.key === 'ArrowUp' || e.key === 'k' || e.key === 'PageUp') {
        e.preventDefault();
        goTo(active - 1);
      } else if (e.key === 'm') {
        setMuted((m) => !m);
      } else if (e.key === 'l' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const item = items[active];
        if (item) toggleLike(item, active, 'key');
      } else if (e.key === ' ' && !t?.closest('button, a')) {
        e.preventDefault();
        togglePlay(active);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // A video that won't embed leaves the reel; the next title slides into place.
  const dropItem = (item: ReelItem, position: number) => {
    trackForYou('video_unavailable', item.key, { surface: 'reel', position, bucket: item.bucket, videoKey: item.video.key });
    setItems((cur) => cur.filter((i) => i.key !== item.key));
  };

  const showEnd = done && !loading;
  const slideCount = items.length + (loading || showEnd ? 1 : 0);
  const paused = quickViewOpen || picker !== null;

  if (items.length === 0 && done) {
    return (
      <div className="flex h-[calc(100dvh-3.5rem)] items-center md:h-dvh">
        <EmptyState
          icon={Clapperboard}
          title="Nothing to play yet"
          description="Favorite or swipe a few titles and we'll line up trailers for you."
          action={
            <Link href="/swipe" className="text-sm font-medium text-primary hover:underline">
              Open Watchly Swipe
            </Link>
          }
        />
      </div>
    );
  }

  return (
    // Under the floating sidebar the dimmed surround runs to the screen edge
    // (the card stays centred in what's left), so the translucent panel sits
    // on the film's colours instead of a blank strip.
    <div className="relative isolate flex h-[calc(100dvh-3.5rem)] items-center justify-center overflow-hidden md:h-dvh md:-ml-(--float-bleed) md:pl-(--float-bleed)">
      <Surround item={items[Math.min(active, items.length - 1)]} still={reducedMotion} />
      {/* The card: a vertical rectangle on desktop, the whole screen on phones. */}
      <div className="relative h-full w-full md:aspect-[9/16] md:h-[calc(100dvh-2rem)] md:w-auto">
        <div
          ref={scroller}
          aria-label="For You"
          className="relative h-full w-full snap-y snap-mandatory overflow-y-auto overscroll-contain bg-background [scrollbar-width:none] md:rounded-2xl md:border md:border-border/60 md:shadow-2xl"
        >
          {/* Snap points + visibility markers, one per screen. On the pinned
              cards they would all collapse to the current position and every
              scroll back up would snap forward again. */}
          {Array.from({ length: slideCount }, (_, i) => (
            <span
              key={i}
              data-sentinel={i}
              aria-hidden
              className="pointer-events-none absolute inset-x-0 h-full snap-start [scroll-snap-stop:always]"
              style={{ top: `${i * 100}%` }}
            />
          ))}
          {items.map((item, i) => {
            const near = i === active || i === active + 1;
            return (
              // Sticky stack: each card pins at the top, so the next one slides
              // up over it instead of pushing it away.
              <div key={item.key} data-slide className="sticky top-0 h-full">
                <div
                  className={cn(
                    'h-full overflow-hidden bg-background',
                    i > 0 && 'rounded-t-2xl shadow-[0_-12px_32px_-8px_rgb(0_0_0/0.7)]',
                  )}
                >
                  <ReelCard
                    item={item}
                    active={i === active}
                    player={!near ? null : i === active && !paused && !userPaused ? 'play' : 'cue'}
                    muted={muted}
                    volume={volume}
                    changeVolume={changeVolume}
                    toggleMute={() => setMuted((m) => !m)}
                    onAutoplayBlocked={() => {
                      setMuted(true);
                      toast.info('Sound is off', 'Your browser blocked sound. Tap the sound button to turn it on.');
                    }}
                    userPaused={i === active && userPaused}
                    togglePlay={() => togglePlay(i)}
                    liked={item.key in liked}
                    toggleLike={() => toggleLike(item, i, 'button')}
                    likeByTap={() => {
                      if (!(item.key in liked)) toggleLike(item, i, 'double_tap');
                    }}
                    inList={inList.has(item.key)}
                    openWatchlist={() => {
                      pickerReported.current = false;
                      setPicker(item);
                    }}
                    onVideoError={() => dropItem(item, i)}
                    onDetailsOpened={() => trackForYou('details_opened', item.key, { surface: 'reel', position: i, bucket: item.bucket })}
                    hint={i === 0 && !moved}
                  />
                </div>
              </div>
            );
          })}
          {(loading || showEnd) && (
            <div data-slide className="sticky top-0 h-full">
              <div className="flex h-full items-center justify-center rounded-t-2xl bg-background px-6 shadow-[0_-12px_32px_-8px_rgb(0_0_0/0.7)]">
                {loading ? (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Finding more…
                  </p>
                ) : (
                  <div className="flex max-w-sm flex-col items-center gap-3 text-center">
                    <p className="text-h3">You&apos;re all caught up</p>
                    <p className="text-sm text-muted-foreground">Rate or swipe a few more titles and new picks will show up here.</p>
                    <div className="flex gap-4 text-sm font-medium">
                      <Link href="/swipe" className="text-primary hover:underline">
                        Watchly Swipe
                      </Link>
                      <Link href="/programme" className="text-primary hover:underline">
                        Tonight&apos;s Programme
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        {/* Previous / next, beside the card's right edge (desktop; phones swipe). */}
        <div className="absolute left-full top-1/2 ml-5 hidden -translate-y-1/2 flex-col gap-4 md:flex">
          <NavButton label="Previous title" keys="↑ or K" disabled={active === 0} onClick={() => goTo(active - 1)}>
            <ChevronUp className="h-6 w-6" />
          </NavButton>
          <NavButton label="Next title" keys="↓ or J" disabled={active >= slideCount - 1} onClick={() => goTo(active + 1)}>
            <ChevronDown className="h-6 w-6" />
          </NavButton>
        </div>
      </div>
      {picker && (
        <AddToWatchlistPicker
          isOpen
          onClose={() => setPicker(null)}
          mediaType={picker.mediaType}
          mediaId={String(picker.tmdbId)}
          title={picker.title}
          onMembershipChange={(yes) => {
            // The picker reports membership once when its lists load, then
            // again after a confirmed add; only the second is a commit.
            if (pickerReported.current && yes) {
              trackForYou('committed', picker.key, {
                surface: 'reel',
                kind: 'watchlist_add',
                position: items.findIndex((i) => i.key === picker.key),
                reason: picker.reason,
                bucket: picker.bucket,
              });
            }
            pickerReported.current = true;
            if (yes !== inList.has(picker.key)) {
              setInList((s) => {
                const n = new Set(s);
                if (yes) n.add(picker.key);
                else n.delete(picker.key);
                return n;
              });
            }
          }}
        />
      )}
    </div>
  );
}

/**
 * Outside the card (desktop): the active title's stills, heavily blurred,
 * crossfading when the title changes and slowly cycling while it plays.
 */
function Surround({ item, still }: { item: ReelItem; still: boolean }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (still || item.photos.length < 2) return;
    const id = setInterval(() => setTick((t) => t + 1), SURROUND_HOLD_MS);
    return () => clearInterval(id);
  }, [item.key, item.photos.length, still]);
  const path = item.photos[tick % Math.max(1, item.photos.length)] ?? item.backdropPath;
  return <FadeStack src={buildImageUrl(path, 'w780')} />;
}

/** Keeps the previous image underneath while the new one fades in. */
function FadeStack({ src }: { src: string | null }) {
  const [layers, setLayers] = useState<{ src: string; id: number }[]>(src ? [{ src, id: 0 }] : []);
  const [lastSrc, setLastSrc] = useState(src);
  if (src !== lastSrc) {
    setLastSrc(src);
    if (src) setLayers((cur) => [...cur.slice(-1), { src, id: (cur.at(-1)?.id ?? 0) + 1 }]);
  }
  return (
    <div aria-hidden className="absolute inset-0 -z-10 hidden bg-background md:block">
      {layers.map((l, i) => (
        <div
          key={l.id}
          className={cn(
            'absolute inset-0',
            i === layers.length - 1 && layers.length > 1 && 'motion-safe:animate-[surround-in_900ms_ease-out_both]',
          )}
        >
          <Image src={l.src} alt="" fill sizes="50vw" className="scale-110 object-cover blur-3xl" />
        </div>
      ))}
      {/* Darken so the card stays the brightest thing on screen. Black in
          both themes: it's a dimmed cinema around the card, not page chrome. */}
      <div className="absolute inset-0 bg-black/80" />
      <style>{'@keyframes surround-in{from{opacity:0}to{opacity:1}}'}</style>
    </div>
  );
}

function NavButton({
  label,
  keys,
  disabled,
  onClick,
  children,
}: {
  label: string;
  keys: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={`${label} (${keys})`}
      className="flex h-14 w-14 items-center justify-center rounded-full bg-secondary text-foreground shadow-lg transition-colors hover:bg-secondary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-40 disabled:hover:bg-secondary cursor-pointer"
    >
      {children}
    </button>
  );
}

function logView(item: ReelItem, position: number, since: number) {
  trackForYou('item_viewed', item.key, {
    surface: 'reel',
    position,
    dwellMs: Date.now() - since,
    reason: item.reason,
    bucket: item.bucket,
    videoType: item.video.type,
  });
}

function without(rec: Record<string, string>, key: string): Record<string, string> {
  const next = { ...rec };
  delete next[key];
  return next;
}
