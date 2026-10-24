'use client';

import type { ReactNode } from 'react';
import Image from 'next/image';
import { cn } from '@/lib/cn';
import { buildImageUrl } from '@/lib/tmdb';
import { QuickViewLink } from '@/components/watchly/QuickViewLink';
import type { LastWatchedTicket } from '@/services/watched/lastWatched';
import { receiptRows, type TicketCopy } from './ticketCopy';

/**
 * The last-watched ticket, set as a box-office receipt: the title's art on
 * the left (poster over the backdrop), the till print on the right with
 * dotted leaders. The right edge (md+) or bottom edge (phones) is what peeks
 * out from behind the member card, so it carries the "Admit one" label.
 */
export function TicketReceipt({
  t,
  copy,
  onOpen,
  action,
}: {
  t: LastWatchedTicket;
  copy: TicketCopy | null;
  onOpen: () => void;
  /** Owner-only control in the corner (export as a story). */
  action?: ReactNode;
}) {
  const backdrop = buildImageUrl(t.backdropPath ?? t.posterPath, 'w780');
  const poster = buildImageUrl(t.posterPath, 'w342');
  const rows = receiptRows(copy);

  return (
    <div className="relative grid h-full grid-rows-[minmax(11rem,1fr)_auto] overflow-hidden rounded-2xl border border-border bg-card md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] md:grid-rows-1">
      <div className="relative overflow-hidden">
        {backdrop && <Image src={backdrop} alt="" fill sizes="(max-width: 768px) 100vw, 420px" className="object-cover" />}
        <div aria-hidden className="absolute inset-0 bg-linear-to-t from-card via-card/30 to-transparent md:bg-linear-to-r md:from-transparent md:via-card/20 md:to-card" />
        <QuickViewLink
          mediaType={t.mediaType}
          titleId={t.tmdbId}
          onClick={onOpen}
          aria-label={`${t.title}: open Quick View`}
          className="group absolute bottom-4 left-5 block h-36 w-24 overflow-hidden rounded-md bg-muted shadow-elevation-card md:bottom-6 md:left-6 md:h-44 md:w-[7.25rem]"
        >
          {poster && <Image src={poster} alt="" fill sizes="120px" className="object-cover transition-transform duration-300 group-hover:scale-[1.03]" />}
        </QuickViewLink>
      </div>

      <div className="flex min-w-0 flex-col justify-center gap-3 p-5 pb-14 sm:p-6 md:pb-6 md:pr-16">
        <div className="flex items-center justify-between gap-3">
          <p className="type-kicker text-muted-foreground">Screen 1 · Admit one · Receipt</p>
          {action}
        </div>
        <QuickViewLink
          mediaType={t.mediaType}
          titleId={t.tmdbId}
          onClick={onOpen}
          className="type-display block text-4xl leading-[0.95] text-foreground decoration-2 underline-offset-4 hover:underline sm:text-5xl"
        >
          {t.title}
        </QuickViewLink>
        <dl className="mt-1 flex flex-col gap-1.5 font-mono text-xs uppercase tracking-wider">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-baseline gap-2">
              <dt className="shrink-0 text-muted-foreground">{k}</dt>
              <span aria-hidden className="min-w-4 flex-1 border-b border-dotted border-border" />
              <dd className="shrink-0 text-right text-foreground">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Thank you · keep this ticket</p>
      </div>

      {/* The edge that peeks out from behind the member card. */}
      <span aria-hidden style={{ top: 0, right: 0, bottom: 0 }} className="absolute hidden w-10 items-center justify-center border-l border-dashed border-border md:flex">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.3em] text-foreground/85 [writing-mode:vertical-rl]">Admit one ▸</span>
      </span>
      <span
        aria-hidden
        style={{ left: 0, right: 0, bottom: 0 }}
        className={cn('absolute flex h-10 items-center justify-center border-t border-dashed border-border font-mono text-[10px] font-semibold uppercase tracking-[0.3em] text-foreground/85 md:hidden')}
      >
        Admit one · last watched
      </span>
    </div>
  );
}
