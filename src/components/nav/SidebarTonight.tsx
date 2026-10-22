'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, RefreshCw } from 'lucide-react';
import { getSidebarTonightAction } from '@/actions/forYou';
import { recentTitles } from '@/client/recentTitles';
import { useRegionStore } from '@/client/stores/region';
import { PATHS } from '@/lib/app';
import { cn } from '@/lib/cn';
import { formatRuntime } from '@/lib/format';
import { buildImageUrl } from '@/lib/tmdb';
import type { SidebarTonight as TonightData } from '@/services/forYou/tonight';
import type { ContinueStatus } from '@/services/forYou/pool';
import type { TonightShow } from '@/client/sidebarPrefs';
import { TonightInfo } from './TonightInfo';

interface Feature {
  key: string;
  href: string;
  image: string | null;
  /** Posters sit from the top; stills fill the frame. */
  isPoster: boolean;
  kicker: string;
  arrived: boolean;
  title: string;
  meta: string;
  why: string | null;
}

interface Stub {
  key: string;
  href: string;
  title: string;
  poster: string | null;
  status: string;
  live: boolean;
}

const STATUS: Record<ContinueStatus, { label: string; live: boolean }> = {
  watching: { label: 'Watching', live: true },
  waiting_for_episode: { label: 'Waiting · next ep', live: false },
  waiting_for_season: { label: 'Waiting · next season', live: false },
  up_next: { label: 'Up next', live: false },
};

// The notches are punched out of the ticket, so they take the sidebar's colour
// (the floating sidebar sets its own, translucent or not).
const SIDEBAR_BG = { backgroundColor: 'var(--sidebar-surface, #0c0d14)' };

// One fetch per region per page load, shared by the desktop sidebar and the
// phone menu (both mount this).
// The server reads the region cookie itself, so the store filling in after
// hydration ('' → 'PH') is not a change; picking another region is.
let cached: { region: string; promise: Promise<TonightData | null> } | null = null;

function loadTonight(region: string) {
  if (!cached || (region && cached.region && cached.region !== region)) {
    cached = { region, promise: getSidebarTonightAction().catch(() => null) };
  } else if (region) {
    cached.region = region;
  }
  return cached.promise;
}

function useTonightData(): TonightData | null | undefined {
  const region = useRegionStore((s) => s.regionCode);
  const [data, setData] = useState<{ value: TonightData | null } | null>(null);
  useEffect(() => {
    let live = true;
    // Client only (effects never run on the server, so the cache is never shared).
    loadTonight(region).then((value) => live && setData({ value }));
    return () => {
      live = false;
    };
  }, [region]);
  // While another region loads, the last ticket stays up.
  return data ? data.value : undefined;
}

function toFeatures(data: TonightData): Feature[] {
  const arrival: Feature[] = data.arrival
    ? [
        {
          key: data.arrival.key,
          href: data.arrival.href,
          image: data.arrival.posterUrl?.replace(/\/w\d+\//, '/w342/') ?? null,
          isPoster: true,
          kicker: data.arrival.service ? `Just landed on ${data.arrival.service}` : 'Just landed',
          arrived: true,
          title: data.arrival.title,
          meta: 'A title you follow',
          why: null,
        },
      ]
    : [];
  return [
    ...arrival,
    ...data.picks.map((p, i) => ({
      key: p.key,
      href: p.href,
      image: buildImageUrl(p.backdropPath, 'w780') ?? buildImageUrl(p.posterPath, 'w342'),
      isPoster: !p.backdropPath,
      kicker: i === 0 ? "Tonight's feature" : 'Or instead',
      arrived: false,
      title: p.title,
      meta: [p.mediaType === 'tv' ? 'Series' : 'Film', p.year, formatRuntime(p.runtimeMinutes), p.service ? `On ${p.service}` : null]
        .filter(Boolean)
        .join(' · '),
      why: p.why,
    })),
  ];
}

/** A tear line across the ticket: a notch at each edge, dashes between. */
function Tear() {
  return (
    <span aria-hidden className="relative block h-0">
      <span className="absolute -left-2 -top-2 h-4 w-4 rounded-full border border-white/10" style={SIDEBAR_BG} />
      <span className="absolute -right-2 -top-2 h-4 w-4 rounded-full border border-white/10" style={SIDEBAR_BG} />
      <span className="absolute inset-x-3 top-0 border-t border-dashed border-white/15" />
    </span>
  );
}

/**
 * "What tonight?" answered in the sidebar, as one ticket: tonight's feature
 * on top (a title you follow that just arrived on a service takes it first;
 * Swap for the next pick), then the titles you're in the middle of as the
 * stubs below. With nothing in progress, the stubs are what you opened last.
 */
export function SidebarTonight({ onNavigate, show = 'both' }: { onNavigate: () => void; show?: Exclude<TonightShow, 'off'> }) {
  const data = useTonightData();
  const recents = useSyncExternalStore(recentTitles.subscribe, recentTitles.get, recentTitles.getServer);
  const [at, setAt] = useState(0);

  if (data === undefined) return <div className={cn('animate-pulse rounded-xl bg-white/5', show === 'ticket' ? 'h-48' : 'h-[26rem]')} aria-hidden />;

  const features = data ? toFeatures(data) : [];
  const tickets: Stub[] = (data?.tickets ?? []).map((t) => ({
    key: t.key,
    href: t.href,
    title: t.title,
    poster: buildImageUrl(t.posterPath, 'w92'),
    status: STATUS[t.status].label,
    live: STATUS[t.status].live,
  }));
  const lastOpened: Stub[] = recents.slice(0, 2).map((r) => ({
    key: r.key,
    href: `/title/${r.mediaType}/${r.id}`,
    title: r.title,
    poster: buildImageUrl(r.posterPath, 'w92'),
    status: r.provider ? `${r.provider.access === 'stream' ? 'On' : r.provider.access === 'rent' ? 'Rent on' : 'Buy on'} ${r.provider.name}` : 'Last opened',
    live: false,
  }));
  // Settings › Sidebar can keep just one half of the ticket.
  const stubs = show === 'feature' ? [] : tickets.length ? tickets : lastOpened;
  const f = show !== 'ticket' && features.length ? features[at % features.length] : null;
  if (!f && stubs.length === 0) return null;

  return (
    <section aria-labelledby="sidebar-tonight">
      {/* The Programme's section mark: a short accent rule and small caps. */}
      <div className="flex items-center justify-between px-1 pb-2.5">
        <div className="flex items-center gap-1.5">
          <h2 id="sidebar-tonight" className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            <span className="h-3 w-0.5 rounded-full bg-primary" aria-hidden />
            Tonight
          </h2>
          <TonightInfo onNavigate={onNavigate} />
        </div>
        {f && features.length > 1 && (
          <button
            type="button"
            onClick={() => setAt((a) => a + 1)}
            aria-label="Swap tonight's feature"
            className="flex items-center gap-1 rounded text-[11px] text-muted-foreground transition-colors hover:text-foreground cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <RefreshCw size={11} aria-hidden /> Swap
          </button>
        )}
      </div>

      <div className="relative rounded-xl border border-white/10 bg-white/[0.03]">
        {f && (
          <div className="overflow-hidden rounded-t-xl">
            <Link href={f.href} onClick={onNavigate} className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
              <span key={f.key} className="relative block aspect-[16/10] overflow-hidden bg-white/5 motion-safe:animate-[tonight-in_500ms_ease-out]">
                {f.image && (
                  <Image
                    src={f.image}
                    alt=""
                    fill
                    sizes="270px"
                    className={cn('object-cover transition-transform duration-700 group-hover:scale-[1.03]', f.isPoster && 'object-top')}
                  />
                )}
                <span className="absolute inset-0 bg-gradient-to-t from-black via-black/25 to-transparent" />
                <span
                  className={cn(
                    'absolute left-3 top-3 max-w-[calc(100%-1.5rem)] truncate rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
                    f.arrived ? 'bg-emerald-400 text-black' : 'bg-black/60 text-white',
                  )}
                >
                  {f.kicker}
                </span>
                <span className="absolute inset-x-0 bottom-0 line-clamp-2 px-3.5 pb-3 text-lg font-bold leading-tight text-white">{f.title}</span>
              </span>
            </Link>
            <div className="flex flex-col gap-1.5 px-3.5 pb-3.5 pt-2.5">
              <p className="text-xs text-muted-foreground">{f.meta}</p>
              {f.why && <p className="border-l-2 border-primary pl-2 text-xs italic text-foreground/85">{f.why}</p>}
            </div>
          </div>
        )}

        {stubs.length > 0 && (
          <>
            {f && <Tear />}
            <h3 className="px-3.5 pb-1 pt-3 font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {tickets.length ? 'On your ticket' : 'Last opened'}
            </h3>
            <ol>
              {stubs.map((s, i) => (
                <li key={s.key}>
                  {i > 0 && <span aria-hidden className="mx-3.5 block border-t border-dashed border-white/10" />}
                  <Link
                    href={s.href}
                    onClick={onNavigate}
                    className="flex items-center gap-3 px-3.5 py-2.5 transition-colors hover:bg-white/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  >
                    <span className="relative h-12 w-8 shrink-0 overflow-hidden rounded-[3px] bg-white/5">
                      {s.poster && <Image src={s.poster} alt="" fill sizes="32px" className="object-cover" />}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="truncate text-sm font-medium text-foreground">{s.title}</span>
                      <span className={cn('flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-widest', s.live ? 'text-emerald-300' : 'text-muted-foreground')}>
                        {s.live && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" aria-hidden />}
                        <span className="truncate">{s.status}</span>
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          </>
        )}

        <Tear />
        <Link
          href={PATHS.PROGRAMME}
          onClick={onNavigate}
          className="flex items-center justify-between rounded-b-xl px-3.5 py-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          Tonight&apos;s full programme <ArrowRight size={12} aria-hidden />
        </Link>
      </div>
      <style>{'@keyframes tonight-in{from{opacity:0}to{opacity:1}}'}</style>
    </section>
  );
}
