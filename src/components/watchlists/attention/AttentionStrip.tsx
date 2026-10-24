'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { dismissAttentionAction, recordWatchlistEventAction } from '@/actions/watchlists';
import { ALERT_KINDS } from '@/services/watchlists/attentionKinds';
import type { AttentionSummary } from '@/services/watchlists/attention';
import { KIND_LABEL, Poster, onceFor, sentence } from './parts';

/**
 * Needs your attention, under the /watchlists stats: "Intermission", one
 * title at a time, poster first. Only what changed or contradicts the
 * member's own record (already seen, waits that are over, services gained
 * or lost), never age. Hidden when there's nothing; a dismissal holds until
 * the set of things changes. Each title opens its list with Tidy up on.
 */
export function AttentionStrip({ summary }: { summary: AttentionSummary }) {
  const flat = ALERT_KINDS.flatMap((k) => summary.entries.filter((e) => e.kind === k));
  const [hidden, setHidden] = useState(summary.dismissed);
  const [at, setAt] = useState(0);
  useEffect(() => {
    if (hidden || !flat.length) return;
    const counts = Object.fromEntries(ALERT_KINDS.map((k) => [k, flat.filter((e) => e.kind === k).length]).filter(([, n]) => n));
    onceFor(`attention_shown:${summary.fingerprint}`, () => void recordWatchlistEventAction({ event: 'attention_shown', metadata: { counts } }).catch(() => {}));
  }, [hidden, flat, summary.fingerprint]);

  if (hidden || !flat.length) return null;
  const i = Math.min(at, flat.length - 1);
  const e = flat[i];
  const href = `/watchlists/${e.watchlistId}?tidy=1`;
  const dismiss = () => {
    setHidden(true);
    void dismissAttentionAction(summary.fingerprint).catch(() => {});
  };

  return (
    <section aria-labelledby="attention-h" aria-roledescription="carousel" className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between gap-3 px-4 pt-3">
        <h2 id="attention-h" className="type-kicker text-muted-foreground">
          Intermission · {flat.length} {flat.length === 1 ? 'thing' : 'things'} changed
        </h2>
        <button type="button" onClick={dismiss} aria-label="Dismiss until something new comes up" title="Hide until something new comes up" className="cursor-pointer rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <X size={14} aria-hidden />
        </button>
      </div>
      <div className="flex items-center gap-5 p-4" aria-live="polite" aria-atomic>
        <Poster e={e} className="w-16 sm:w-20" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="type-kicker text-primary">{KIND_LABEL[e.kind]}</span>
          <p className="type-display truncate text-3xl leading-none text-foreground sm:text-4xl">{e.title}</p>
          <p className="text-sm text-muted-foreground">{sentence(e)}</p>
        </div>
        <Link href={href} className="hidden h-9 shrink-0 items-center gap-1.5 rounded-md bg-primary px-3.5 text-sm font-semibold text-primary-foreground hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:inline-flex">
          Take a look <ArrowRight size={14} aria-hidden />
        </Link>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-2">
        <div className="flex gap-1" aria-hidden>
          {flat.map((x, n) => (
            <span key={x.key} className={cn('h-1 w-5 rounded-full', n === i ? 'bg-primary' : 'bg-border')} />
          ))}
        </div>
        <div className="flex items-center gap-1">
          <span className="whitespace-nowrap font-mono text-[11px] tabular-nums text-muted-foreground">
            {i + 1} of {flat.length}
          </span>
          <button type="button" aria-label="Previous" disabled={i === 0} onClick={() => setAt(i - 1)} className="cursor-pointer rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-30">
            <ChevronLeft size={14} />
          </button>
          <button type="button" aria-label="Next" disabled={i >= flat.length - 1} onClick={() => setAt(i + 1)} className="cursor-pointer rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-30">
            <ChevronRight size={14} />
          </button>
          <Link href={href} className="ml-1 whitespace-nowrap rounded-md px-2 py-1 text-xs font-semibold text-foreground hover:bg-secondary sm:hidden">
            Take a look
          </Link>
        </div>
      </div>
    </section>
  );
}
