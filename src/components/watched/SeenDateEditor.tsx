'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Modal } from '@/components/ui/Modal';
import { cn } from '@/lib/cn';
import { buildImageUrl } from '@/lib/tmdb';
import { setSeenDateAction } from '@/actions/watched';
import type { SeenSnapshot } from '@/services/watched';
import {
  MONTHS_LONG,
  MONTHS_SHORT,
  daysInMonth,
  seenLabel,
  seenToDate,
  type SeenParts,
} from '@/lib/watchedDates';

// "When did you see it?" for one ticket, or a queue of them (the fix-dates
// hint walks a same-day cluster one at a time). Year first, then an optional
// month and day, or "I don't remember": nobody has to invent an exact day.

export interface SeenDateTarget {
  mediaType: 'movie' | 'tv';
  mediaId: string;
  title: string;
  posterPath: string | null;
  /** The title's release date ('YYYY-MM-DD'); nothing earlier can be picked. Null when unknown. */
  releaseDate: string | null;
  /** The current date, or null when undated. */
  current: SeenParts | null;
}

export interface SeenDateSaved {
  target: SeenDateTarget;
  parts: SeenParts | null;
  snapshot: SeenSnapshot;
}

export function SeenDateEditor({
  queue,
  onClose,
  onSaved,
  onDone,
  heading,
  cancelLabel,
  onRemove,
}: {
  queue: SeenDateTarget[];
  /** Always called on close, with whatever was saved (possibly nothing). */
  onClose: (saves: SeenDateSaved[]) => void;
  /** After each successful save (update the stub straight away). */
  onSaved?: (saved: SeenDateSaved) => void;
  /** When the editor closes after saving at least one; gets every save, in order. */
  onDone?: (saves: SeenDateSaved[]) => void;
  /** Kicker above the question, e.g. "Added to Watched". */
  heading?: string;
  /** The secondary button for a single ticket (default "Cancel"). */
  cancelLabel?: string;
  /** Single ticket only: offers "Remove from Watched" in the footer. */
  onRemove?: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [saves, setSaves] = useState<SeenDateSaved[]>([]);
  const target = queue[index];

  const finish = (all: SeenDateSaved[]) => {
    if (all.length > 0) onDone?.(all);
    onClose(all);
  };
  const next = (all: SeenDateSaved[]) => {
    if (index + 1 < queue.length) setIndex(index + 1);
    else finish(all);
  };

  if (!target) return null;
  return (
    <Modal
      isOpen
      onClose={() => finish(saves)}
      labelledBy="seen-date-title"
      className="max-w-md border border-border bg-card"
    >
      {/* Remount per ticket so the form starts from that ticket's date. */}
      <SeenDateForm
        key={`${target.mediaType}:${target.mediaId}`}
        target={target}
        position={queue.length > 1 ? { index, total: queue.length } : null}
        heading={heading}
        cancelLabel={cancelLabel}
        onRemove={
          queue.length === 1 && onRemove
            ? () => {
                onRemove();
                onClose(saves);
              }
            : undefined
        }
        onSkip={() => next(saves)}
        onCancel={() => finish(saves)}
        onSaved={(saved) => {
          const all = [...saves, saved];
          setSaves(all);
          onSaved?.(saved);
          next(all);
        }}
      />
    </Modal>
  );
}

function SeenDateForm({
  target,
  position,
  heading,
  cancelLabel = 'Cancel',
  onRemove,
  onSkip,
  onCancel,
  onSaved,
}: {
  target: SeenDateTarget;
  position: { index: number; total: number } | null;
  heading?: string;
  cancelLabel?: string;
  onRemove?: () => void;
  onSkip: () => void;
  onCancel: () => void;
  onSaved: (saved: SeenDateSaved) => void;
}) {
  const now = new Date();
  const thisYear = now.getFullYear();
  const release = target.releaseDate && /^\d{4}-\d{2}-\d{2}$/.test(target.releaseDate)
    ? { year: Number(target.releaseDate.slice(0, 4)), month: Number(target.releaseDate.slice(5, 7)) - 1, day: Number(target.releaseDate.slice(8, 10)) }
    : null;
  const minYear = Math.min(release?.year ?? 1900, thisYear);
  const years = Array.from({ length: thisYear - minYear + 1 }, (_, i) => thisYear - i);

  const [unknown, setUnknown] = useState(target.current === null);
  const [year, setYear] = useState(target.current?.year ?? thisYear);
  const [month, setMonth] = useState<number | null>(target.current?.month ?? null);
  const [day, setDay] = useState<number | null>(target.current?.day ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Nothing in the future, nothing before release.
  const monthDisabled = (m: number) =>
    (year === thisYear && m > now.getMonth()) || (release !== null && year === release.year && m < release.month);
  const maxDay =
    month === null ? 31 : year === thisYear && month === now.getMonth() ? now.getDate() : daysInMonth(year, month);
  const minDay = release && year === release.year && month === release.month ? release.day : 1;
  const parts: SeenParts | null = unknown ? null : { year, month, day: month === null ? null : day };

  // Year first, then narrower: changing the year clears the month and day,
  // and changing the month clears the day, so "just the year" is one pick
  // and a logged date's month/day never carry over to a different year.
  const pickYear = (y: number) => {
    if (y === year) return;
    setYear(y);
    setMonth(null);
    setDay(null);
  };
  const pickMonth = (m: number) => {
    setMonth(month === m ? null : m);
    setDay(null);
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await setSeenDateAction(target.mediaType, target.mediaId, seenToDate(parts));
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onSaved({ target, parts, snapshot: res.snapshot });
    } catch {
      setError('Couldn’t save the date. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const poster = buildImageUrl(target.posterPath, 'w185');
  const preview = seenLabel(parts);

  return (
    <div className="flex flex-col">
      <header className="flex items-center gap-4 border-b border-border px-5 pb-4 pt-5 pr-14">
        <span className="relative h-16 w-11 shrink-0 overflow-hidden rounded-sm bg-muted">
          {poster && <Image src={poster} alt="" fill sizes="44px" className="object-cover" />}
        </span>
        <div className="min-w-0">
          {(position || heading) && (
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {position ? `Ticket ${position.index + 1} of ${position.total}` : heading}
            </p>
          )}
          <h2 id="seen-date-title" className="text-base font-semibold leading-tight">
            When did you see it?
          </h2>
          <p className="truncate text-sm text-muted-foreground">{target.title}</p>
        </div>
      </header>

      <div className={cn('flex flex-col gap-5 px-5 py-5', unknown && 'pointer-events-none opacity-40')} aria-disabled={unknown}>
        <label className="flex flex-col gap-1.5">
          <span className="type-kicker text-muted-foreground">Year</span>
          <select
            value={year}
            onChange={(e) => pickYear(Number(e.target.value))}
            disabled={unknown}
            className="h-10 w-32 rounded-md border border-input bg-background px-3 text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>

        <fieldset className="flex flex-col gap-1.5">
          <legend className="type-kicker mb-1.5 text-muted-foreground">
            Month <span className="normal-case tracking-normal">· optional</span>
          </legend>
          <div className="grid grid-cols-6 gap-1.5">
            {MONTHS_SHORT.map((m, i) => (
              <button
                key={m}
                type="button"
                aria-pressed={month === i}
                aria-label={MONTHS_LONG[i]}
                disabled={unknown || monthDisabled(i)}
                onClick={() => pickMonth(i)}
                className={cn(
                  'h-9 rounded-md border text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-35 cursor-pointer',
                  month === i
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border hover:border-foreground/40 hover:bg-foreground/5',
                )}
              >
                {m}
              </button>
            ))}
          </div>
        </fieldset>

        <label className={cn('flex flex-col gap-1.5', month === null && 'opacity-40')}>
          <span className="type-kicker text-muted-foreground">
            Day <span className="normal-case tracking-normal">· optional</span>
          </span>
          <select
            value={day ?? ''}
            onChange={(e) => setDay(e.target.value ? Number(e.target.value) : null)}
            disabled={unknown || month === null}
            className="h-10 w-32 rounded-md border border-input bg-background px-3 text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed cursor-pointer"
          >
            <option value="">Not sure</option>
            {Array.from({ length: Math.max(0, maxDay - minDay + 1) }, (_, i) => minDay + i).map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3">
        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={unknown}
            onChange={(e) => setUnknown(e.target.checked)}
            className="h-4 w-4 accent-primary cursor-pointer"
          />
          I don&apos;t remember
        </label>
        {/* The ticket line as it will print. */}
        <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground" aria-live="polite">
          {preview ? (
            <>
              Seen <span className="text-foreground">{preview}</span>
            </>
          ) : (
            <span className="text-foreground">Undated</span>
          )}
        </p>
      </div>

      {error && (
        <p role="alert" className="px-5 pb-1 text-sm text-destructive">
          {error}
        </p>
      )}

      <footer className="flex items-center justify-end gap-2 px-5 pb-5 pt-2">
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="mr-auto rounded-sm text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-destructive hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
          >
            Remove from Watched
          </button>
        )}
        <button
          type="button"
          onClick={position ? onSkip : onCancel}
          className="h-9 rounded-md px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground cursor-pointer"
        >
          {position ? 'Skip' : cancelLabel}
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy}
          className="h-9 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60 cursor-pointer"
        >
          {busy ? 'Saving…' : position && position.index + 1 < position.total ? 'Save & next' : 'Save'}
        </button>
      </footer>
    </div>
  );
}
