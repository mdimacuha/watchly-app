'use client';

// Profile → Likes: titles liked in Watchly Swipe, the For You reel and onboarding, merged
// newest first. Wide screens: a poster wall (title on hover) beside a details
// panel for the selected title. Phones: captioned posters, no hover needed.
// Scrolls inside a fixed-height box and loads the next page near the end.
// Owner can unlike (with Undo); visitors only see it when "Show my likes" is on.

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeftRight, ArrowUpRight, Eye, Heart, HeartOff, Loader2, Lock, Sparkles, Ticket } from 'lucide-react';
import { cn } from '@/lib/cn';
import { buildImageUrl } from '@/lib/tmdb';
import { formatRelativeAgo } from '@/lib/format';
import { QuickViewLink } from '@/components/watchly/QuickViewLink';
import { useToast } from '@/hooks/useToast';
import { getProfileLikesPageAction, removeLikeAction, restoreLikeAction } from '@/actions/likes';
import type { LikeOrigin, ProfileLike } from '@/services/swipe/likes';

type Filter = LikeOrigin | 'all';

const FILTERS: [Filter, string][] = [
  ['all', 'All'],
  ['swipe', 'Watchly Swipe'],
  ['reel', 'For You'],
  ['onboarding', 'Watchly Onboarding'],
];

const ORIGIN = {
  swipe: { label: 'Watchly Swipe', short: 'Swipe', Icon: ArrowLeftRight },
  reel: { label: 'For You', short: 'For You', Icon: Sparkles },
  onboarding: { label: 'Watchly Onboarding', short: 'Onboarding', Icon: Ticket },
} as const;

const WIDE = '(min-width: 1024px)';
const subscribeWide = (cb: () => void) => {
  const mq = window.matchMedia(WIDE);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
};

interface Props {
  username: string;
  owner: boolean;
  /** Owner's "Preview as visitor": load as a signed-out viewer. */
  preview: boolean;
  /** Owner's current setting, for the privacy line. */
  hidden: boolean;
}

export function ProfileLikes({ username, owner, preview, hidden }: Props) {
  const [filter, setFilter] = useState<Filter>('all');
  const feed = useLikes(username, preview, filter);
  const wide = useSyncExternalStore(subscribeWide, () => window.matchMedia(WIDE).matches, () => false);
  const toast = useToast();
  // Removed this visit; Undo takes a title back out of this set.
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const items = feed.items.filter((l) => !removed.has(l.id));

  const toggleRemoved = (id: string, on: boolean) =>
    setRemoved((s) => {
      const n = new Set(s);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });

  const unlike = (like: ProfileLike) => {
    toggleRemoved(like.id, true);
    removeLikeAction(like.id)
      .then((handle) => {
        if (!handle) return;
        toast.custom({
          type: 'info',
          variant: 'action',
          title: 'Removed from your likes',
          description: like.title || undefined,
          actionLabel: 'Undo',
          duration: 5000,
          onAction: () =>
            restoreLikeAction(handle)
              .then(() => toggleRemoved(like.id, false))
              .catch(() => toast.error('Could not bring that like back')),
        });
      })
      .catch(() => {
        toggleRemoved(like.id, false);
        toast.error('Could not remove that like');
      });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1.5" role="group" aria-label="Filter likes">
          {/* Onboarding only shows for people who picked titles at signup. */}
          {FILTERS.filter(([f]) => f !== 'onboarding' || feed.origins?.includes('onboarding')).map(([f, label]) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium transition-colors cursor-pointer',
                filter === f ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:text-foreground',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {owner && (
          <Link href="/settings/privacy" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
            {hidden ? <Lock className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {hidden ? 'Only you can see your likes' : 'Visitors can see your likes'} · Change
          </Link>
        )}
      </div>

      <ScrollBox feed={feed} empty={emptyText(filter, owner)}>
        {wide ? <Inspect items={items} owner={owner} onUnlike={unlike} /> : <Captioned items={items} owner={owner} onUnlike={unlike} />}
      </ScrollBox>
    </div>
  );
}

function emptyText(filter: Filter, owner: boolean) {
  if (filter !== 'all') return `No likes from ${ORIGIN[filter].label} yet.`;
  return owner ? "No likes yet. Like titles in Watchly Swipe or For You and they'll show up here." : 'No likes yet.';
}

// ---------------------------------------------------------------------------
// Data + the scrolling box
// ---------------------------------------------------------------------------

interface FeedState {
  for: Filter;
  items: ProfileLike[];
  hasMore: boolean;
  failed: boolean;
}

function useLikes(username: string, preview: boolean, filter: Filter) {
  const [state, setState] = useState<FeedState>({ for: filter, items: [], hasMore: true, failed: false });
  const [loading, setLoading] = useState(false);
  const busy = useRef(false);
  // Sources this profile has likes from (first unfiltered page); null until known.
  const [origins, setOrigins] = useState<LikeOrigin[] | null>(null);
  // A new filter starts from an empty page; its first load replaces this.
  const current: FeedState = state.for === filter ? state : { for: filter, items: [], hasMore: true, failed: false };

  const loadMore = useCallback(() => {
    if (busy.current || !current.hasMore || current.failed) return;
    busy.current = true;
    setLoading(true);
    getProfileLikesPageAction(username, {
      before: current.items.at(-1)?.likedAt,
      origin: filter === 'all' ? undefined : filter,
      asGuest: preview,
    })
      .then((page) => {
        if (page.origins) setOrigins(page.origins);
        setState((s) => ({
          for: filter,
          items: [...(s.for === filter ? s.items : []), ...page.items],
          hasMore: page.hasMore,
          failed: false,
        }));
      })
      .catch(() => setState((s) => ({ for: filter, items: s.for === filter ? s.items : [], hasMore: true, failed: true })))
      .finally(() => {
        busy.current = false;
        setLoading(false);
      });
  }, [current.failed, current.hasMore, current.items, filter, preview, username]);

  const retry = () => setState((s) => ({ ...s, failed: false }));

  return { ...current, origins, loading, loadMore, retry };
}

type Feed = ReturnType<typeof useLikes>;

/** Fixed height so the page never grows; a sentinel near the end pulls the next page. */
function ScrollBox({ feed, empty, children }: { feed: Feed; empty: string; children: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const { loadMore } = feed;
  useEffect(() => {
    const io = new IntersectionObserver((e) => e[0]?.isIntersecting && loadMore(), {
      root: box.current,
      rootMargin: '0px 0px 400px 0px',
    });
    if (end.current) io.observe(end.current);
    return () => io.disconnect();
  }, [loadMore]);

  const isEmpty = !feed.loading && !feed.hasMore && feed.items.length === 0;
  return (
    <div ref={box} className="h-[min(70vh,44rem)] overflow-y-auto overscroll-contain rounded-xl border border-border p-3 [scrollbar-width:thin]">
      {isEmpty ? (
        <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-sm text-muted-foreground">
          <Heart className="h-6 w-6" />
          {empty}
        </div>
      ) : (
        children
      )}
      <div ref={end} aria-hidden className="h-px" />
      {feed.loading && (
        <p className="flex items-center justify-center gap-2 py-4 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading likes…
        </p>
      )}
      {feed.failed && (
        <p className="py-4 text-center text-xs text-muted-foreground">
          Couldn&apos;t load likes.{' '}
          <button type="button" onClick={feed.retry} className="font-medium text-foreground underline underline-offset-4 cursor-pointer">
            Try again
          </button>
        </p>
      )}
      {!feed.hasMore && feed.items.length > 0 && (
        <p className="py-4 text-center text-xs text-muted-foreground">That&apos;s every like.</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bits
// ---------------------------------------------------------------------------

const runtime = (m: number | null) => (m ? (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`) : null);
const metaLine = (l: ProfileLike) => [l.year, runtime(l.runtime), l.genres.join(', ') || null].filter(Boolean).join(' · ');
// A Swipe favorite counts as a like; it says so.
const whenLine = (l: ProfileLike) =>
  `${ORIGIN[l.origin].short}${l.favorited ? ' · Favorited' : ''} · ${formatRelativeAgo(l.likedAt)}`;

/** The like's source as an icon chip on a poster corner. */
function OriginChip({ origin }: { origin: LikeOrigin }) {
  const { Icon, label } = ORIGIN[origin];
  return (
    <span
      title={`Liked in ${label}`}
      className="pointer-events-none absolute left-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/65 text-white"
    >
      <Icon className="h-3 w-3" aria-hidden />
      <span className="sr-only">Liked in {label}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Wide: poster wall + details panel
// ---------------------------------------------------------------------------

function Inspect({ items, owner, onUnlike }: { items: ProfileLike[]; owner: boolean; onUnlike: (l: ProfileLike) => void }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = items.find((l) => l.id === selectedId) ?? items[0];
  if (!selected) return null;

  // Unliking the selected title moves the panel to its neighbour.
  const unlike = (l: ProfileLike) => {
    const i = items.findIndex((x) => x.id === l.id);
    setSelectedId((items[i + 1] ?? items[i - 1])?.id ?? null);
    onUnlike(l);
  };

  return (
    <div className="flex gap-4">
      <ul className="grid flex-1 grid-cols-4 content-start gap-2.5 xl:grid-cols-5">
        {items.map((l) => {
          const src = buildImageUrl(l.posterPath, 'w185');
          const on = l.id === selected.id;
          return (
            <li key={l.id} className="group relative">
              <button
                type="button"
                onClick={() => setSelectedId(l.id)}
                aria-pressed={on}
                aria-label={l.title || 'Untitled'}
                className={cn(
                  'relative block aspect-[2/3] w-full overflow-hidden rounded-md bg-muted transition-shadow cursor-pointer',
                  on && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
                )}
              >
                {src && <Image src={src} alt="" fill sizes="(min-width:1280px) 130px, 160px" className="object-cover" />}
                <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-2 pt-8 text-left opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                  <span className="line-clamp-2 block text-xs font-semibold text-white">{l.title}</span>
                  <span className="block text-[10px] text-white/75">{whenLine(l)}</span>
                </span>
              </button>
              <OriginChip origin={l.origin} />
            </li>
          );
        })}
      </ul>
      <Panel like={selected} owner={owner} onUnlike={unlike} />
    </div>
  );
}

function Panel({ like, owner, onUnlike }: { like: ProfileLike; owner: boolean; onUnlike: (l: ProfileLike) => void }) {
  const src = buildImageUrl(like.posterPath, 'w342');
  const { label, Icon } = ORIGIN[like.origin];
  return (
    // Exactly the scroll box's inner height: the poster takes whatever the
    // details leave, so Open / Unlike sit on the bottom edge.
    <aside
      aria-label="Selected like"
      className="sticky top-0 flex h-[calc(min(70vh,44rem)-1.5rem)] w-72 shrink-0 flex-col self-start overflow-hidden rounded-lg border border-border bg-card xl:w-80"
    >
      <div className="flex min-h-0 flex-1 justify-center border-b border-border bg-secondary/40 p-4">
        <QuickViewLink
          mediaType={like.mediaType}
          titleId={like.tmdbId}
          aria-label={`Open ${like.title || 'title'}`}
          className="relative block aspect-[2/3] h-full max-w-full overflow-hidden rounded-md bg-muted shadow-lg"
        >
          {src && <Image src={src} alt="" fill sizes="288px" className="object-cover" />}
        </QuickViewLink>
      </div>
      <div className="shrink-0 space-y-2 p-4">
        <p className="font-semibold leading-tight">{like.title || 'Unknown title'}</p>
        {metaLine(like) && <p className="text-xs text-muted-foreground">{metaLine(like)}</p>}
        {like.overview && <p className="line-clamp-4 text-sm text-foreground/85">{like.overview}</p>}
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Icon className="h-3 w-3" aria-hidden /> {like.favorited ? 'Favorited' : 'Liked'} in {label} · {formatRelativeAgo(like.likedAt)}
        </p>
        <div className="flex gap-2 pt-1">
          <QuickViewLink
            mediaType={like.mediaType}
            titleId={like.tmdbId}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <ArrowUpRight className="h-3.5 w-3.5" /> Open
          </QuickViewLink>
          {owner && (
            <button
              type="button"
              onClick={() => onUnlike(like)}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-medium hover:bg-secondary cursor-pointer"
            >
              <HeartOff className="h-3.5 w-3.5" /> Unlike
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Narrow: captioned posters, readable without hover
// ---------------------------------------------------------------------------

function Captioned({ items, owner, onUnlike }: { items: ProfileLike[]; owner: boolean; onUnlike: (l: ProfileLike) => void }) {
  return (
    <ul className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3">
      {items.map((l) => {
        const src = buildImageUrl(l.posterPath, 'w342');
        const { Icon } = ORIGIN[l.origin];
        return (
          <li key={l.id} className="group min-w-0">
            <div className="relative">
              <QuickViewLink
                mediaType={l.mediaType}
                titleId={l.tmdbId}
                aria-label={l.title || 'Open title'}
                className="relative block aspect-[2/3] w-full overflow-hidden rounded-md bg-muted"
              >
                {src && <Image src={src} alt="" fill sizes="(min-width:640px) 30vw, 45vw" className="object-cover" />}
              </QuickViewLink>
              {owner && (
                <button
                  type="button"
                  onClick={() => onUnlike(l)}
                  aria-label={`Unlike ${l.title || 'this title'}`}
                  title="Unlike"
                  className="absolute right-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-black/65 text-white transition-opacity hover:bg-black/80 cursor-pointer [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:focus-visible:opacity-100"
                >
                  <Heart className="h-4 w-4 fill-primary text-primary" />
                </button>
              )}
            </div>
            <QuickViewLink mediaType={l.mediaType} titleId={l.tmdbId} className="mt-2 block truncate text-sm font-semibold hover:text-primary">
              {l.title || 'Unknown title'}
            </QuickViewLink>
            <p className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] text-muted-foreground">
              <Icon className="h-3 w-3 shrink-0" aria-hidden />
              {whenLine(l)}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
