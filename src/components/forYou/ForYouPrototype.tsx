'use client';

/**
 * PROTOTYPE — throwaway. Do not ship as-is.
 *
 * Round 2 (owner picked A + B, plus C's grouping). Earlier A/B/C variants
 * are saved in the checkpoint.
 *
 *   /for-you         — The Programme (Feature · 2 Supports · Wildcard) with
 *                      the Dial (time + mood) on top: turning it refills the
 *                      slots with titles that fit.
 *   /for-you/deeper  — "Go deeper": the Dial over compact rows, grouped as
 *                      "Because you liked X" sections + "Something different".
 *
 * The dial lives in the URL (?time=&mood=) so it carries over to Deeper.
 * Both read the shared pool (services/forYou/pool.ts); swaps are local.
 */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  ArrowLeftRight,
  Check,
  Layers,
  RefreshCw,
  Search,
  ThumbsDown,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { buildImageUrl } from '@/lib/tmdb';
import { formatRuntime } from '@/lib/format';
import { QuickViewLink } from '@/components/watchly/QuickViewLink';
import { ProviderBadge } from '@/components/ui/ProviderBadge';
import { AddToWatchlistButton } from '@/components/watchlists/AddToWatchlistButton';
import { useToastStore } from '@/client/stores/toast';
import { useToast } from '@/hooks/useToast';
import { trackForYou } from '@/client/forYouEvents';
import { markAsWatchedAction } from '@/actions/forYou';
import { recordSwipeAction, undoSwipeAction } from '@/actions/swipe';
import type { ContinueItem, ContinueStatus, ForYouPool, PoolPick } from '@/services/forYou/pool';

/** /for-you — the Programme with the Dial. */
export function ForYouMain({ pool }: { pool: ForYouPool }) {
  const state = usePickState(pool, 'programme');
  useFeedViewed(pool, 'programme');
  return <ProgrammeView pool={pool} state={state} />;
}

/** /for-you/deeper — the Dial over grouped rows. */
export function ForYouDeeper({ pool }: { pool: ForYouPool }) {
  const state = usePickState(pool, 'deeper');
  useFeedViewed(pool, 'deeper');
  return <DeeperView pool={pool} state={state} />;
}

function useFeedViewed(pool: ForYouPool, variant: string) {
  useEffect(() => {
    trackForYou('feed_viewed', undefined, {
      variant,
      picks: pool.picks.length,
      continue: pool.continueItems.length,
      wildcards: pool.wildcards.length,
    });
  }, [pool, variant]);
}

// ---------------------------------------------------------------------------
// Shared state + actions
// ---------------------------------------------------------------------------

type PickState = ReturnType<typeof usePickState>;

function usePickState(pool: ForYouPool, variant: string) {
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const toast = useToast();
  const { addToast, removeToast } = useToastStore();

  const available = useMemo(() => pool.picks.filter((p) => !removed.has(p.key)), [pool, removed]);
  const remove = (key: string) => setRemoved((prev) => new Set(prev).add(key));
  const restore = (key: string) =>
    setRemoved((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });

  const opened = (pick: PoolPick, slot: string, position: number) =>
    trackForYou('title_opened', pick.key, { variant, slot, position, reason: pick.reasons[0] });

  const markWatched = async (pick: PoolPick, slot: string) => {
    remove(pick.key);
    trackForYou('committed', pick.key, { variant, slot, kind: 'watched' });
    try {
      const where = await markAsWatchedAction(pick.ui.tmdbId, pick.ui.mediaType);
      toast.success(where === 'watchlist_finished' ? 'Marked finished' : 'Saved to watched', pick.ui.title);
    } catch {
      restore(pick.key);
      toast.error("Couldn't mark as watched", 'Please try again.');
    }
  };

  /** "Not for me": recorded as a pass so it stops being recommended; undoable. */
  const dismiss = async (pick: PoolPick, slot: string) => {
    remove(pick.key);
    trackForYou('dismissed', pick.key, { variant, slot });
    try {
      const res = await recordSwipeAction({
        tmdbId: pick.ui.tmdbId,
        mediaType: pick.ui.mediaType,
        action: 'passed',
        source: 'recommendation',
        metadata: { from: 'for_you', variant, slot },
      });
      const id = addToast({
        type: 'info',
        variant: 'action',
        title: 'Not for you — noted',
        description: pick.ui.title,
        actionLabel: 'Undo',
        duration: 5000,
        onAction: () => {
          removeToast(id);
          restore(pick.key);
          void undoSwipeAction({
            swipeId: res.swipeId,
            tmdbId: pick.ui.tmdbId,
            mediaType: pick.ui.mediaType,
            reverseFavorite: false,
          });
        },
      });
    } catch {
      restore(pick.key);
      toast.error("Couldn't save that", 'Please try again.');
    }
  };

  const onSaved = (pick: PoolPick, slot: string) =>
    trackForYou('committed', pick.key, { variant, slot, kind: 'watchlist_open' });

  return { available, removed, remove, restore, opened, markWatched, dismiss, onSaved, variant };
}

function meta(pick: PoolPick) {
  const runtime = pick.ui.runtimeMinutes
    ? pick.ui.mediaType === 'movie'
      ? formatRuntime(pick.ui.runtimeMinutes)
      : `${pick.ui.runtimeMinutes}m / ep`
    : null;
  return [pick.ui.mediaType === 'movie' ? 'Film' : 'Series', pick.ui.year, runtime, pick.ui.genres.slice(0, 2).join(', ') || null]
    .filter(Boolean)
    .join(' · ');
}

function Providers({ pick, max = 3 }: { pick: PoolPick; max?: number }) {
  if (pick.ui.providers.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {pick.ui.providers.slice(0, max).map((p) => (
        <ProviderBadge key={p.providerId} providerId={p.providerId} label={p.providerName} logoPath={p.logoPath} size="sm" />
      ))}
    </div>
  );
}

/** Save · Seen it · Not for me — the same verbs everywhere. */
function PickActions({ pick, slot, state, compact = false }: { pick: PoolPick; slot: string; state: PickState; compact?: boolean }) {
  const btn = cn(
    'inline-flex items-center gap-1.5 rounded-md border border-border font-medium text-foreground transition-colors cursor-pointer hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
    compact ? 'h-8 px-2 text-xs' : 'h-10 px-3 text-sm',
  );
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span onClickCapture={() => state.onSaved(pick, slot)}>
        <AddToWatchlistButton mediaType={pick.ui.mediaType} mediaId={String(pick.ui.tmdbId)} title={pick.ui.title} variant={compact ? 'icon' : 'default'} />
      </span>
      <button type="button" className={btn} onClick={() => void state.markWatched(pick, slot)}>
        <Check className="h-4 w-4" />
        {!compact && 'Seen it'}
        {compact && <span className="sr-only">Seen it</span>}
      </button>
      <button type="button" className={btn} onClick={() => void state.dismiss(pick, slot)}>
        <ThumbsDown className="h-4 w-4" />
        {!compact && 'Not for me'}
        {compact && <span className="sr-only">Not for me</span>}
      </button>
    </div>
  );
}

const STATUS_LABEL: Record<ContinueStatus, string> = {
  watching: 'Watching',
  waiting_for_episode: 'Waiting for episode',
  waiting_for_season: 'Waiting for season',
  up_next: 'Up next',
};

/** Shows/films you're in the middle of or queued — the secondary job. */
function ContinueStrip({ items, variant }: { items: ContinueItem[]; variant: string }) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="fy-continue">
      <h2 id="fy-continue" className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        Continue
      </h2>
      <ul className="no-scrollbar -mx-1 flex gap-3 overflow-x-auto px-1">
        {items.map((c, i) => {
          const poster = buildImageUrl(c.ui.posterPath, 'w185');
          return (
            <li key={c.key} className="shrink-0">
              <QuickViewLink
                mediaType={c.ui.mediaType}
                titleId={c.ui.tmdbId}
                onClick={() => trackForYou('title_opened', c.key, { variant, slot: 'continue', position: i + 1 })}
                className="group flex w-64 items-center gap-3 rounded-lg border border-border bg-card p-2 hover:bg-foreground/5 transition-colors"
              >
                <div className="relative h-16 w-11 shrink-0 overflow-hidden rounded bg-muted">
                  {poster && <Image src={poster} alt="" fill sizes="44px" className="object-cover" />}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold group-hover:text-primary transition-colors">{c.ui.title}</p>
                  <p className={cn('text-xs', c.status === 'watching' ? 'text-primary' : 'text-muted-foreground')}>
                    {STATUS_LABEL[c.status]}
                  </p>
                </div>
              </QuickViewLink>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="flex flex-col gap-1">
      <h1 className="text-h2">{title}</h1>
      <p className="text-sm text-muted-foreground">
        Picked from your favorites, watchlists and swipes.
        {children}
      </p>
    </header>
  );
}

/** Page end: Swipe for more · Go deeper (when offered) · Search. */
function EndCap({ line, deeperHref }: { line: string; deeperHref?: string }) {
  return (
    <section className="border-t border-border pt-8 text-center">
      <p className="text-h3">{line}</p>
      <p className="mt-1 text-sm text-muted-foreground">Want more? Keep exploring.</p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <Link href="/swipe" className="inline-flex h-10 items-center gap-2 rounded-md border border-border px-4 text-sm font-medium hover:bg-foreground/5">
          <ArrowLeftRight className="h-4 w-4" /> Swipe for more
        </Link>
        {deeperHref && (
          // The natural next step from tonight's programme — primary weight.
          <Link
            href={deeperHref}
            onClick={() => trackForYou('title_opened', undefined, { variant: 'programme', slot: 'go_deeper' })}
            className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Layers className="h-4 w-4" /> Go deeper
          </Link>
        )}
        <Link href="/search" className="inline-flex h-10 items-center gap-2 rounded-md border border-border px-4 text-sm font-medium hover:bg-foreground/5">
          <Search className="h-4 w-4" /> Search
        </Link>
      </div>
    </section>
  );
}

function NoTaste() {
  return (
    <div className="rounded-xl border border-border bg-card p-8 text-center">
      <p className="text-h3">Nothing to pick from yet</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Favorite a few titles or swipe through some picks — For You learns from both.
      </p>
      <div className="mt-4 flex justify-center">
        <Link href="/swipe" className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">
          <ArrowLeftRight className="h-4 w-4" /> Try WatchlySwipe
        </Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The Programme (+ Dial)
// ---------------------------------------------------------------------------

type SlotId = 'feature' | 'support1' | 'support2';
const SLOT_IDS: SlotId[] = ['feature', 'support1', 'support2'];

function ProgrammeView({ pool, state }: { pool: ForYouPool; state: PickState }) {
  const dial = useDial();
  const { addToast, removeToast } = useToastStore();
  const byKey = useMemo(() => new Map(pool.picks.map((p) => [p.key, p])), [pool]);

  // Picks that fit the dial right now (still in ranked order).
  const { time, mood } = dial;
  const fitting = useMemo(
    () => state.available.filter((p) => matchesDial(p, time, mood)),
    [state.available, time, mood],
  );
  const wildcards = useMemo(
    () => pool.wildcards.filter((p) => matchesDialLoosely(p, time, mood)),
    [pool.wildcards, time, mood],
  );

  // Which pick sits in each slot, dealt per dial setting. `shown` = every
  // pick dealt or swapped in under this setting, so Swap never ping-pongs.
  const dealFor = (dialKey: string) => {
    const slots: Record<SlotId, string | null> = {
      feature: fitting[0]?.key ?? null,
      support1: fitting[1]?.key ?? null,
      support2: fitting[2]?.key ?? null,
    };
    const shown = new Set(Object.values(slots).filter((k): k is string => !!k));
    return { dialKey, slots, shown };
  };
  const [deal, setDeal] = useState(() => dealFor(dial.key));
  const [wildIndex, setWildIndex] = useState(0);
  // Dial changed → re-deal (state update during render, React's recommended
  // alternative to an effect for resetting state on a prop change).
  if (deal.dialKey !== dial.key) {
    setDeal(dealFor(dial.key));
    setWildIndex(0);
  }

  // Slots as displayed: a removed pick (seen / not for me) is replaced by
  // the next fitting pick not yet shown. Derived, so no extra state.
  const slots: Record<SlotId, string | null> = { ...deal.slots };
  const taken = new Set(deal.shown);
  for (const slot of SLOT_IDS) {
    const key = slots[slot];
    if (key && state.removed.has(key)) {
      const fill = fitting.find((p) => !taken.has(p.key) && !Object.values(slots).includes(p.key));
      slots[slot] = fill?.key ?? null;
      if (fill) taken.add(fill.key);
    }
  }

  const swap = (slot: SlotId) => {
    const prev = slots[slot];
    const next = fitting.find((p) => !taken.has(p.key) && !Object.values(slots).includes(p.key));
    if (!next) {
      addToast({ type: 'info', title: 'No more picks fit the dial', description: 'Try another time or mood.' });
      return;
    }
    setDeal((d) => ({ ...d, slots: { ...slots, [slot]: next.key }, shown: new Set(taken).add(next.key) }));
    trackForYou('spin', next.key, { variant: 'programme', slot, replaced: prev, time, mood });
    const id = addToast({
      type: 'info',
      variant: 'action',
      title: 'Swapped',
      description: next.ui.title,
      actionLabel: 'Undo',
      duration: 4000,
      onAction: () => {
        removeToast(id);
        setDeal((d) => ({ ...d, slots: { ...d.slots, [slot]: prev } }));
      },
    });
  };

  const slotPick = (slot: SlotId) => {
    const key = slots[slot];
    return key && !state.removed.has(key) ? byKey.get(key) ?? null : null;
  };
  const feature = slotPick('feature');
  const supports = (['support1', 'support2'] as const).map((s) => ({ slot: s, pick: slotPick(s) }));
  const wild = wildcards.length ? wildcards[wildIndex % wildcards.length] : null;
  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="flex flex-col gap-10">
      <PageHeader title="Tonight's Programme">
        {' '}
        <span suppressHydrationWarning>· {today}</span>
      </PageHeader>
      <ContinueStrip items={pool.continueItems} variant="programme" />

      {!pool.hasTaste ? (
        <NoTaste />
      ) : (
        <>
          <DialControls dial={dial} variant="programme" />
          <p className="sr-only" aria-live="polite">
            Programme updated: {dial.description}
          </p>

          {!feature ? (
            <NothingFits dial={dial} />
          ) : (
            <>
              <section aria-label="Feature">
                <SlotLabel n="I" label="The Feature" onSwap={() => swap('feature')} />
                <Stub>
                  <FeatureStub pick={feature} state={state} />
                </Stub>
              </section>

              {supports.some((s) => s.pick) && (
                <div className="grid gap-6 md:grid-cols-2">
                  {supports.map(({ slot, pick }, i) =>
                    pick ? (
                      <section key={slot} aria-label={`Support ${i + 1}`}>
                        <SlotLabel n={i === 0 ? 'II' : 'III'} label="Support" onSwap={() => swap(slot)} />
                        <Stub>
                          <SmallStub pick={pick} slot={slot} state={state} position={i + 2} />
                        </Stub>
                      </section>
                    ) : null,
                  )}
                </div>
              )}
            </>
          )}

          {wild && (
            <section aria-label="Wildcard">
              <SlotLabel n="IV" label="Wildcard · something different" onSwap={() => setWildIndex((i) => i + 1)} />
              <Stub>
                <SmallStub pick={wild} slot="wildcard" state={state} position={4} />
              </Stub>
            </section>
          )}

          <EndCap line="That's tonight." deeperHref={`/for-you/deeper${dial.query}`} />
        </>
      )}
    </div>
  );
}

function SlotLabel({ n, label, onSwap }: { n: string; label: string; onSwap: () => void }) {
  return (
    <div className="mb-2 flex items-center gap-3">
      <span className="font-mono text-xs text-muted-foreground">{n}</span>
      <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{label}</span>
      <button
        type="button"
        onClick={onSwap}
        className="ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs text-muted-foreground hover:bg-foreground/5 hover:text-foreground cursor-pointer"
      >
        <RefreshCw className="h-3.5 w-3.5" /> Swap
      </button>
    </div>
  );
}

/** Ticket-stub frame: dashed perforation + punched notches on the sides. */
function Stub({ children }: { children: ReactNode }) {
  return (
    <div className="relative rounded-xl border border-border bg-card">
      {/* Half-circles punched into the edge, layered above the content (the
          feature's backdrop used to paint over full circles poking outside). */}
      <span aria-hidden className="absolute -left-px top-1/2 z-10 h-6 w-3 -translate-y-1/2 rounded-r-full border border-l-0 border-border bg-background" />
      <span aria-hidden className="absolute -right-px top-1/2 z-10 h-6 w-3 -translate-y-1/2 rounded-l-full border border-r-0 border-border bg-background" />
      {children}
    </div>
  );
}

function FeatureStub({ pick, state }: { pick: PoolPick; state: PickState }) {
  const backdrop = buildImageUrl(pick.ui.backdropPath, 'w780');
  const poster = buildImageUrl(pick.ui.posterPath, 'w342');
  return (
    <div className="relative overflow-hidden rounded-xl">
      {backdrop && <Image src={backdrop} alt="" fill sizes="1100px" className="object-cover opacity-35" />}
      <div className="absolute inset-0 bg-linear-to-r from-card via-card/90 to-card/30" />
      <div className="relative flex gap-6 p-6">
        <QuickViewLink
          mediaType={pick.ui.mediaType}
          titleId={pick.ui.tmdbId}
          onClick={() => state.opened(pick, 'feature', 1)}
          className="relative hidden sm:block h-60 w-40 shrink-0 overflow-hidden rounded-lg bg-muted shadow-elevation-card"
        >
          {poster && <Image src={poster} alt={pick.ui.title} fill sizes="160px" className="object-cover" />}
        </QuickViewLink>
        <div className="flex min-w-0 flex-col gap-3">
          <QuickViewLink
            mediaType={pick.ui.mediaType}
            titleId={pick.ui.tmdbId}
            onClick={() => state.opened(pick, 'feature', 1)}
            className="text-4xl font-bold leading-tight tracking-tight hover:text-primary transition-colors"
          >
            {pick.ui.title}
          </QuickViewLink>
          <p className="text-sm text-muted-foreground">{meta(pick)}</p>
          {/* The reason, printed like a credit line. */}
          <p className="border-l-2 border-primary pl-3 text-sm italic text-foreground/90">
            {pick.reasons.join(' · ')}
          </p>
          {pick.ui.overview && <p className="max-w-2xl text-sm text-muted-foreground line-clamp-2">{pick.ui.overview}</p>}
          <Providers pick={pick} />
          <div className="border-t border-dashed border-border pt-3">
            <PickActions pick={pick} slot="feature" state={state} />
          </div>
        </div>
      </div>
    </div>
  );
}

function SmallStub({ pick, slot, state, position }: { pick: PoolPick; slot: string; state: PickState; position: number }) {
  const poster = buildImageUrl(pick.ui.posterPath, 'w185');
  return (
    <div className="flex gap-4 p-4">
      <QuickViewLink
        mediaType={pick.ui.mediaType}
        titleId={pick.ui.tmdbId}
        onClick={() => state.opened(pick, slot, position)}
        className="relative h-36 w-24 shrink-0 overflow-hidden rounded-md bg-muted"
      >
        {poster && <Image src={poster} alt={pick.ui.title} fill sizes="96px" className="object-cover" />}
      </QuickViewLink>
      <div className="flex min-w-0 flex-col gap-1.5">
        <QuickViewLink
          mediaType={pick.ui.mediaType}
          titleId={pick.ui.tmdbId}
          onClick={() => state.opened(pick, slot, position)}
          className="truncate text-lg font-semibold hover:text-primary transition-colors"
        >
          {pick.ui.title}
        </QuickViewLink>
        <p className="text-xs text-muted-foreground">{meta(pick)}</p>
        <p className="text-xs italic text-foreground/80 line-clamp-2">{pick.reasons.slice(0, 2).join(' · ')}</p>
        <div className="mt-auto border-t border-dashed border-border pt-2">
          <PickActions pick={pick} slot={slot} state={state} compact />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// B — The Dial
// ---------------------------------------------------------------------------

type TimeId = 'any' | 'u90' | '2h' | 'series';
type MoodId = 'tense' | 'light' | 'big' | 'slow';

const TIMES: { id: TimeId; label: string; short: string }[] = [
  { id: 'any', label: 'Any length', short: 'Any' },
  { id: 'u90', label: 'Under 90 min', short: '<90m' },
  { id: '2h', label: 'About 2 hours', short: '~2h' },
  { id: 'series', label: 'A series', short: 'Series' },
];

// Mood → TMDB genre ids (movie + TV ids mixed).
const MOODS: { id: MoodId; label: string; genres: number[] }[] = [
  { id: 'tense', label: 'Tense', genres: [53, 27, 80, 9648] },
  { id: 'light', label: 'Light', genres: [35, 16, 10751, 10749, 10402] },
  { id: 'big', label: 'Big', genres: [28, 12, 878, 14, 10752, 10759, 10765] },
  { id: 'slow', label: 'Slow-burn', genres: [18, 36, 99, 37] },
];


function fitsTime(p: PoolPick, t: TimeId) {
  const rt = p.ui.runtimeMinutes;
  if (t === 'any') return true;
  if (t === 'series') return p.ui.mediaType === 'tv';
  if (p.ui.mediaType !== 'movie' || !rt) return false;
  return t === 'u90' ? rt <= 95 : rt <= 140;
}


/** Mood → genre match (any overlap). */
function fitsMood(p: PoolPick, m: MoodId | null) {
  if (!m) return true;
  const genres = new Set(MOODS.find((x) => x.id === m)!.genres);
  return p.genreIds.some((g) => genres.has(g));
}

/** Full match: runtime-aware (taste picks carry runtimes). */
function matchesDial(p: PoolPick, t: TimeId, m: MoodId | null) {
  return fitsTime(p, t) && fitsMood(p, m);
}

/** Wildcards have no runtime — match on type + mood only. */
function matchesDialLoosely(p: PoolPick, t: TimeId, m: MoodId | null) {
  const typeOk = t === 'any' || (t === 'series' ? p.ui.mediaType === 'tv' : p.ui.mediaType === 'movie');
  return typeOk && fitsMood(p, m);
}

/** Dial state in the URL (?time=&mood=) so it survives reloads and carries to Deeper. */
function useDial() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const rawTime = searchParams.get('time');
  const rawMood = searchParams.get('mood');
  const time: TimeId = TIMES.some((t) => t.id === rawTime) ? (rawTime as TimeId) : 'any';
  const mood: MoodId | null = MOODS.some((m) => m.id === rawMood) ? (rawMood as MoodId) : null;

  const set = (nextTime: TimeId, nextMood: MoodId | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (nextTime === 'any') params.delete('time');
    else params.set('time', nextTime);
    if (nextMood) params.set('mood', nextMood);
    else params.delete('mood');
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const queryParams = new URLSearchParams();
  if (time !== 'any') queryParams.set('time', time);
  if (mood) queryParams.set('mood', mood);
  const query = queryParams.toString() ? `?${queryParams.toString()}` : '';

  const description = [
    TIMES.find((t) => t.id === time)!.label.toLowerCase(),
    mood && MOODS.find((m) => m.id === mood)!.label.toLowerCase(),
  ]
    .filter(Boolean)
    .join(', ');

  return { time, mood, set, key: `${time}|${mood ?? ''}`, query, description };
}

type Dial = ReturnType<typeof useDial>;

/** Time (radio group) + mood (toggle chips). */
function DialControls({ dial, variant }: { dial: Dial; variant: string }) {
  const change = (t: TimeId, m: MoodId | null) => {
    dial.set(t, m);
    trackForYou('filter_changed', undefined, { variant, time: t, mood: m });
  };
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 sm:p-4">
      {/* Phones: one even 4-up row with short labels. sm+: the full pill. */}
      <div role="radiogroup" aria-label="How much time" className="grid grid-cols-4 gap-1 rounded-lg bg-secondary p-1 sm:flex sm:w-fit">
        {TIMES.map((t) => (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={dial.time === t.id}
            aria-label={t.label}
            onClick={() => change(t.id, dial.mood)}
            className={cn(
              'rounded-md px-2 py-1.5 text-sm font-medium whitespace-nowrap transition-colors cursor-pointer sm:px-3',
              dial.time === t.id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <span className="sm:hidden">{t.short}</span>
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>
      {/* Phones: a single swipeable row (bleeds to the card edge). */}
      <div className="no-scrollbar -mx-3 flex items-center gap-2 overflow-x-auto px-3 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
        <span className="shrink-0 text-xs uppercase tracking-widest text-muted-foreground">Mood</span>
        {MOODS.map((m) => (
          <button
            key={m.id}
            type="button"
            aria-pressed={dial.mood === m.id}
            onClick={() => change(dial.time, dial.mood === m.id ? null : m.id)}
            className={cn(
              'shrink-0 rounded-full border px-3 py-1 text-sm whitespace-nowrap transition-colors cursor-pointer',
              dial.mood === m.id ? 'border-primary bg-primary/15 text-foreground' : 'border-border text-muted-foreground hover:text-foreground',
            )}
          >
            {m.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function NothingFits({ dial }: { dial: Dial }) {
  return (
    <div className="rounded-xl border border-dashed border-border p-10 text-center">
      <p className="font-medium">Nothing fits {dial.description} right now.</p>
      <button type="button" onClick={() => dial.set('any', null)} className="mt-2 text-sm text-primary hover:underline cursor-pointer">
        Reset the dial
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Go deeper — the Dial over grouped rows ("Because you liked X" sections)
// ---------------------------------------------------------------------------

const MAX_SECTIONS = 8;
const PER_SECTION = 4;

function DeeperView({ pool, state }: { pool: ForYouPool; state: PickState }) {
  const dial = useDial();
  const { time, mood } = dial;

  // Every fitting pick, grouped by the seed it came from; one title once.
  const sections = useMemo(() => {
    // Grouped by the seed itself (not its title — two seeds can share one,
    // e.g. a remake).
    const groups = new Map<string, { seed: PoolPick['seed']; picks: PoolPick[] }>();
    for (const p of state.available) {
      if (!matchesDial(p, time, mood)) continue;
      const id = p.seed ? `${p.seed.mediaType}:${p.seed.tmdbId}` : 'taste';
      const group = groups.get(id) ?? { seed: p.seed, picks: [] };
      group.picks.push(p);
      groups.set(id, group);
    }
    return [...groups.entries()].slice(0, MAX_SECTIONS).map(([id, g]) => ({
      id,
      seed: g.seed,
      picks: g.picks.slice(0, PER_SECTION),
    }));
  }, [state.available, time, mood]);

  const different = useMemo(
    () => pool.wildcards.filter((p) => matchesDialLoosely(p, time, mood)).slice(0, PER_SECTION),
    [pool.wildcards, time, mood],
  );
  const total = sections.reduce((n, s) => n + s.picks.length, 0) + different.length;

  return (
    <div className="flex flex-col gap-8">
      <Link
        href={`/for-you${dial.query}`}
        className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Tonight&apos;s programme
      </Link>
      <PageHeader title="Go deeper" />

      {!pool.hasTaste ? (
        <NoTaste />
      ) : (
        <>
          <DialControls dial={dial} variant="deeper" />
          <p className="sr-only" aria-live="polite">
            {total} picks, {dial.description}
          </p>

          {total === 0 ? (
            <NothingFits dial={dial} />
          ) : (
            <div className="flex flex-col gap-10">
              {sections.map((s, si) => (
                <section key={s.id} aria-labelledby={`deeper-${si}`}>
                  <h2 id={`deeper-${si}`} className="mb-3 text-lg font-semibold">
                    {s.seed ? (
                      <>
                        Because you liked{' '}
                        {/* The seed opens its own Quick View — "why this?" */}
                        <QuickViewLink
                          mediaType={s.seed.mediaType}
                          titleId={s.seed.tmdbId}
                          onClick={() =>
                            trackForYou('title_opened', `${s.seed!.mediaType}:${s.seed!.tmdbId}`, {
                              variant: 'deeper',
                              slot: 'seed_heading',
                            })
                          }
                          className="underline decoration-border decoration-2 underline-offset-4 transition-colors hover:text-primary hover:decoration-primary"
                        >
                          {s.seed.title}
                        </QuickViewLink>
                      </>
                    ) : (
                      'Matches your taste'
                    )}
                  </h2>
                  <ol className="flex flex-col gap-2">
                    {s.picks.map((p, i) => (
                      <li key={p.key} className="rounded-xl border border-border bg-card overflow-hidden">
                        {i === 0 ? (
                          <TopPick pick={p} state={state} />
                        ) : (
                          <DialRow pick={p} state={state} position={i + 1} />
                        )}
                      </li>
                    ))}
                  </ol>
                </section>
              ))}
              {different.length > 0 && (
                <section aria-labelledby="deeper-different">
                  <h2 id="deeper-different" className="mb-1 text-lg font-semibold">
                    Something different
                  </h2>
                  <p className="mb-3 text-sm text-muted-foreground">Trending this week, outside your usual picks.</p>
                  <ol className="flex flex-col gap-2">
                    {different.map((p, i) => (
                      <li key={p.key} className="rounded-xl border border-border bg-card overflow-hidden">
                        {i === 0 ? (
                          <TopPick pick={p} state={state} label="Wildcard pick" />
                        ) : (
                          <DialRow pick={p} state={state} position={i + 1} />
                        )}
                      </li>
                    ))}
                  </ol>
                </section>
              )}
            </div>
          )}

          <EndCap line="That's everything for now." />
        </>
      )}
    </div>
  );
}
function DialRow({ pick, state, position }: { pick: PoolPick; state: PickState; position: number }) {
  const poster = buildImageUrl(pick.ui.posterPath, 'w154');
  return (
    <div className="flex items-center gap-4 p-3">
      <span className="w-6 shrink-0 text-center font-mono text-sm text-muted-foreground">{position}</span>
      <QuickViewLink
        mediaType={pick.ui.mediaType}
        titleId={pick.ui.tmdbId}
        onClick={() => state.opened(pick, 'row', position)}
        className="relative h-20 w-14 shrink-0 overflow-hidden rounded bg-muted"
      >
        {poster && <Image src={poster} alt={pick.ui.title} fill sizes="56px" className="object-cover" />}
      </QuickViewLink>
      <div className="min-w-0 flex-1">
        <QuickViewLink
          mediaType={pick.ui.mediaType}
          titleId={pick.ui.tmdbId}
          onClick={() => state.opened(pick, 'row', position)}
          className="block truncate font-semibold hover:text-primary transition-colors"
        >
          {pick.ui.title}
        </QuickViewLink>
        <p className="text-xs text-muted-foreground">{meta(pick)}</p>
        <p className="truncate text-xs text-foreground/80">{pick.reasons.slice(0, 2).join(' · ')}</p>
      </div>
      <div className="hidden md:block"><Providers pick={pick} max={2} /></div>
      <PickActions pick={pick} slot="row" state={state} compact />
    </div>
  );
}

/**
 * A section's #1, in the same shape as Search's top result: backdrop,
 * poster, label, title, meta, overview, reasons, services, Quick view +
 * the usual actions.
 */
function TopPick({ pick, state, label = 'Top pick' }: { pick: PoolPick; state: PickState; label?: string }) {
  const backdrop = buildImageUrl(pick.ui.backdropPath, 'w780');
  const poster = buildImageUrl(pick.ui.posterPath, 'w342');
  return (
    <div className="relative">
      {backdrop && <Image src={backdrop} alt="" fill sizes="1100px" className="object-cover opacity-30" />}
      <div className="absolute inset-0 bg-linear-to-r from-card via-card/85 to-transparent" />
      <div className="relative flex gap-5 p-5">
        <QuickViewLink
          mediaType={pick.ui.mediaType}
          titleId={pick.ui.tmdbId}
          onClick={() => state.opened(pick, 'section_top', 1)}
          className="relative hidden sm:block h-48 w-32 shrink-0 overflow-hidden rounded-md bg-muted shadow-elevation-card"
        >
          {poster && <Image src={poster} alt={pick.ui.title} fill sizes="128px" className="object-cover" />}
        </QuickViewLink>
        <div className="flex min-w-0 flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-widest text-primary">{label}</span>
          <QuickViewLink
            mediaType={pick.ui.mediaType}
            titleId={pick.ui.tmdbId}
            onClick={() => state.opened(pick, 'section_top', 1)}
            className="text-3xl font-bold leading-tight hover:text-primary transition-colors"
          >
            {pick.ui.title}
          </QuickViewLink>
          <p className="text-sm text-muted-foreground">{meta(pick)}</p>
          {pick.ui.overview && (
            <p className="max-w-2xl text-sm text-muted-foreground/90 line-clamp-2">{pick.ui.overview}</p>
          )}
          <p className="text-xs text-foreground/80">{pick.reasons.slice(1).join(' · ')}</p>
          <Providers pick={pick} />
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <QuickViewLink
              mediaType={pick.ui.mediaType}
              titleId={pick.ui.tmdbId}
              onClick={() => state.opened(pick, 'section_top', 1)}
              className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Quick view
            </QuickViewLink>
            <PickActions pick={pick} slot="section_top" state={state} />
          </div>
        </div>
      </div>
    </div>
  );
}
