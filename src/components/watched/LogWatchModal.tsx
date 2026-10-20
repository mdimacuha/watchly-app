'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { Search, TicketCheck } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { cn } from '@/lib/cn';
import { buildImageUrl } from '@/lib/tmdb';
import { useToast } from '@/hooks/useToast';
import { useAuthStore } from '@/client/stores/auth';
import { trackProfile } from '@/client/profileEvents';
import { logWatchAction, restoreLogWatchAction } from '@/actions/watched';
import { MONTHS_LONG, seenLabel, seenToDate, type SeenParts } from '@/lib/watchedDates';
import type { LogWatchSnapshot } from '@/services/watched';
import type { SearchResponse, SearchResponseItem } from '@/types/tmdb';

// "Admit one": log past watches in a row. Search, pick a title, say roughly
// when (the year carries over to the next one), log it, repeat. Each row
// keeps its own Undo; exact days can be set later on the ticket.

type RowState =
  | { kind: 'idle' }
  | { kind: 'picking' }
  | { kind: 'saving' }
  | { kind: 'logged'; label: string; snapshot: LogWatchSnapshot }
  | { kind: 'already' }
  | { kind: 'error'; message: string };

const UNKNOWN = 'unknown';

export function LogWatchModal({
  onClose,
  watchedKeys,
}: {
  /** Gets how many were logged, so the tab can refresh. */
  onClose: (logged: number) => void;
  /** Titles already watched (shown as "In Watched", not loggable). */
  watchedKeys: ReadonlySet<string> | null;
}) {
  const toast = useToast();
  const viewerId = useAuthStore((s) => s.user?.id ?? null);
  const thisYear = new Date().getFullYear();
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResponseItem[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchFailed, setSearchFailed] = useState(false);
  const [rows, setRows] = useState<Record<string, RowState>>({});
  // Carried from one log to the next: most people log a stretch at a time.
  const [year, setYear] = useState<string>(String(thisYear));
  const [month, setMonth] = useState<string>('');
  const [logged, setLogged] = useState(0);

  // Debounced title search (the search API is rate-limited per minute).
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      setSearching(true);
      setSearchFailed(false);
      try {
        const res = await fetch(`/api/v1/tmdb/search?q=${encodeURIComponent(q)}&type=all`);
        if (!res.ok) throw new Error('Search failed');
        const data = (await res.json()) as SearchResponse;
        if (!cancelled) setResults(data.results.slice(0, 8));
      } catch {
        if (!cancelled) setSearchFailed(true);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query]);

  const keyOf = (r: SearchResponseItem) => `${r.mediaType}:${r.id}`;
  const setRow = (key: string, state: RowState) => setRows((cur) => ({ ...cur, [key]: state }));

  const logIt = async (item: SearchResponseItem) => {
    const key = keyOf(item);
    const parts: SeenParts | null = year === UNKNOWN ? null : { year: Number(year), month: month === '' ? null : Number(month), day: null };
    setRow(key, { kind: 'saving' });
    try {
      const res = await logWatchAction(item.mediaType, String(item.id), { seen: seenToDate(parts), past: true });
      if (!res.ok) {
        setRow(key, { kind: 'error', message: res.error });
        return;
      }
      if (res.already) {
        setRow(key, { kind: 'already' });
        return;
      }
      setRow(key, { kind: 'logged', label: seenLabel(parts) ?? 'no date', snapshot: res.snapshot });
      setLogged((n) => n + 1);
      if (viewerId) {
        trackProfile(viewerId, 'watched_backfilled', key, {
          precision: seenToDate(parts).precision,
          batchIndex: logged + 1,
        });
      }
      // Straight on to the next one.
      inputRef.current?.focus();
      inputRef.current?.select();
    } catch {
      setRow(key, { kind: 'error', message: 'Could not log it. Please try again.' });
    }
  };

  const undo = async (item: SearchResponseItem, snapshot: LogWatchSnapshot) => {
    const key = keyOf(item);
    try {
      await restoreLogWatchAction(item.mediaType, String(item.id), snapshot);
      setRow(key, { kind: 'idle' });
      setLogged((n) => Math.max(0, n - 1));
    } catch {
      toast.error('Could not undo', 'Please try again.');
    }
  };

  const minYearFor = (item: SearchResponseItem) => Math.min(item.year ? Number(item.year) : 1900, thisYear);
  const q = query.trim();

  return (
    <Modal
      isOpen
      onClose={() => onClose(logged)}
      labelledBy="log-watch-title"
      className="max-w-lg border border-border bg-card"
    >
      <header className="border-b border-border px-5 pb-4 pt-5">
        {/* Only the text clears the close button; the search runs full width. */}
        <div className="pr-10">
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Admit one</p>
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="log-watch-title" className="text-base font-semibold leading-tight">
            Log a past watch
          </h2>
          {logged > 0 && (
            <span className="font-mono text-[11px] uppercase tracking-widest text-primary" aria-live="polite">
              {logged} logged
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Search for something you&apos;ve seen. A rough year is fine; set the exact day on the ticket later.
        </p>
        </div>
        <label className="relative mt-4 block">
          <span className="sr-only">Search titles</span>
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={inputRef}
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Film or series title"
            className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
      </header>

      <div className="max-h-[min(55dvh,26rem)] overflow-y-auto" aria-busy={searching}>
        {q.length < 2 ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">
            Start typing a title. Logged titles land on your Watched tab.
          </p>
        ) : searchFailed ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">Search isn&apos;t responding. Try again in a moment.</p>
        ) : results === null || (searching && results.length === 0) ? (
          <ul aria-label="Loading" className="py-2">
            {[0, 1, 2].map((i) => (
              <li key={i} className="flex items-center gap-3 px-5 py-2.5">
                <span className="h-14 w-10 shrink-0 rounded-sm bg-secondary animate-pulse" />
                <span className="h-3 w-40 rounded bg-secondary animate-pulse" />
              </li>
            ))}
          </ul>
        ) : results.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">No titles match “{q}”.</p>
        ) : (
          <ul className={cn('py-2 transition-opacity', searching && 'opacity-60')}>
            {results.map((item) => {
              const key = keyOf(item);
              const row = rows[key] ?? { kind: 'idle' };
              const inWatched = row.kind === 'already' || (row.kind !== 'logged' && watchedKeys?.has(key));
              const poster = buildImageUrl(item.posterPath, 'w92');
              const minYear = minYearFor(item);
              return (
                <li key={key} className={cn('px-5 py-2.5', row.kind === 'picking' && 'bg-secondary/40')}>
                  <div className="flex items-center gap-3">
                    <span className="relative h-14 w-10 shrink-0 overflow-hidden rounded-sm bg-muted">
                      {poster && <Image src={poster} alt="" fill sizes="40px" className="object-cover" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{item.title}</p>
                      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                        {item.mediaType === 'movie' ? 'Film' : 'Series'}
                        {item.year ? ` · ${item.year}` : ''}
                      </p>
                    </div>
                    {row.kind === 'logged' ? (
                      <span className="flex shrink-0 items-center gap-2 text-xs">
                        <span className="inline-flex items-center gap-1 font-medium text-primary">
                          <TicketCheck className="h-3.5 w-3.5" /> {row.label === 'no date' ? 'Logged' : `Seen ${row.label}`}
                        </span>
                        <button
                          type="button"
                          onClick={() => void undo(item, row.snapshot)}
                          className="rounded-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
                        >
                          Undo
                        </button>
                      </span>
                    ) : inWatched ? (
                      <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                        <TicketCheck className="h-3.5 w-3.5" /> In Watched
                      </span>
                    ) : row.kind !== 'picking' && row.kind !== 'saving' ? (
                      <button
                        type="button"
                        onClick={() => {
                          // Keep the carried year only if this title existed then.
                          if (year !== UNKNOWN && Number(year) < minYear) {
                            setYear(String(minYear));
                            setMonth('');
                          }
                          setRow(key, { kind: 'picking' });
                        }}
                        className="h-8 shrink-0 rounded-md border border-border px-3 text-xs font-medium transition-colors hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
                      >
                        Seen it
                      </button>
                    ) : null}
                  </div>

                  {(row.kind === 'picking' || row.kind === 'saving') && (
                    <div className="mt-3 flex flex-wrap items-end gap-2 pl-[3.25rem]">
                      <label className="flex flex-col gap-1">
                        <span className="type-kicker text-muted-foreground">When</span>
                        <select
                          value={year}
                          onChange={(e) => {
                            setYear(e.target.value);
                            setMonth('');
                          }}
                          className="h-9 rounded-md border border-input bg-background px-2 text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
                        >
                          {Array.from({ length: thisYear - minYear + 1 }, (_, i) => thisYear - i).map((y) => (
                            <option key={y} value={y}>
                              {y}
                            </option>
                          ))}
                          <option value={UNKNOWN}>Don&apos;t remember</option>
                        </select>
                      </label>
                      <label className={cn('flex flex-col gap-1', year === UNKNOWN && 'opacity-40')}>
                        <span className="type-kicker text-muted-foreground">Month</span>
                        <select
                          value={month}
                          disabled={year === UNKNOWN}
                          onChange={(e) => setMonth(e.target.value)}
                          className="h-9 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed cursor-pointer"
                        >
                          <option value="">Not sure</option>
                          {MONTHS_LONG.map((m, i) =>
                            Number(year) === thisYear && i > new Date().getMonth() ? null : (
                              <option key={m} value={i}>
                                {m}
                              </option>
                            ),
                          )}
                        </select>
                      </label>
                      <button
                        type="button"
                        onClick={() => void logIt(item)}
                        disabled={row.kind === 'saving'}
                        className="h-9 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60 cursor-pointer"
                      >
                        {row.kind === 'saving' ? 'Logging…' : 'Log it'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setRow(key, { kind: 'idle' })}
                        className="h-9 rounded-md px-3 text-sm text-muted-foreground transition-colors hover:text-foreground cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                  {row.kind === 'error' && (
                    <p role="alert" className="mt-2 pl-[3.25rem] text-xs text-destructive">
                      {row.message}{' '}
                      <button
                        type="button"
                        onClick={() => setRow(key, { kind: 'picking' })}
                        className="text-foreground underline-offset-4 hover:underline cursor-pointer"
                      >
                        Change it
                      </button>
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <footer className="flex items-center justify-between gap-3 border-t border-border px-5 py-3">
        <p className="text-xs text-muted-foreground">
          {logged > 0 ? `${logged} added to your Watched tab.` : 'Up to 50 a day.'}
        </p>
        <button
          type="button"
          onClick={() => onClose(logged)}
          className="h-9 rounded-md border border-border px-4 text-sm font-medium transition-colors hover:bg-foreground/5 cursor-pointer"
        >
          Done
        </button>
      </footer>
    </Modal>
  );
}
