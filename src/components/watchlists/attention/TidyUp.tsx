'use client';

import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';
import { anton } from '@/lib/fonts';
import { recordWatchlistEventAction } from '@/actions/watchlists';
import type { AttentionEntry } from '@/services/watchlists/attention';
import { ChoiceButton, Poster, SECTIONS, choicesFor, isPrimary, onceFor, plural } from './parts';
import { useTidy, type TidyChange } from './useTidy';

/**
 * Tidy up, inside one watchlist: the owner's suggestions as sections of a
 * programme sheet, strongest evidence first, the shelf last and folded.
 * Started by the owner, never on its own; every choice has Undo and ranks
 * never move. "Mark all finished" is offered only for Already seen.
 */
export function TidyUp({ entries: initial, onChange, onClose }: { entries: AttentionEntry[]; onChange: (c: TidyChange) => void; onClose: () => void }) {
  const tidy = useTidy(initial, onChange);
  const [openShelf, setOpenShelf] = useState(false);
  useEffect(() => {
    onceFor('tidy_opened', () => void recordWatchlistEventAction({ event: 'tidy_opened', metadata: { suggestions: initial.length } }).catch(() => {}));
  }, [initial.length]);

  return (
    // The detail page doesn't load the display face; Tidy up brings its own.
    <section aria-label="Tidy up" className={cn(anton.variable, 'flex flex-col gap-5 rounded-lg border border-border bg-card p-5')}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h2 className="type-display text-3xl text-foreground">Tidy up</h2>
          <span className="type-kicker text-muted-foreground" aria-live="polite">
            {tidy.entries.length ? plural(tidy.entries.length, 'suggestion') : 'All done'}
          </span>
        </div>
        <button type="button" onClick={onClose} className="inline-flex h-8 cursor-pointer items-center rounded-md border border-border px-3 text-xs font-semibold text-foreground hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Done
        </button>
      </div>

      {SECTIONS.map((s) => {
        const es = tidy.entries.filter((e) => e.kind === s.kind);
        if (!es.length) return null;
        const folded = s.kind === 'dust' && !openShelf;
        return (
          <div key={s.kind} className="flex flex-col gap-2 border-t border-dashed border-border pt-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 className="type-kicker text-foreground">
                  {s.title} · <span className="text-muted-foreground">{es.length}</span>
                </h3>
                <p className="text-xs text-muted-foreground">{s.blurb}</p>
              </div>
              {s.kind === 'seen' && es.length > 1 && <ChoiceButton primary label={`Mark all ${es.length} finished`} disabled={tidy.busy} onClick={() => tidy.apply(es, 'finish')} />}
              {s.kind === 'dust' && (
                <button type="button" aria-expanded={openShelf} onClick={() => setOpenShelf((o) => !o)} className="inline-flex cursor-pointer items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {openShelf ? 'Fold' : 'Look through them'} <ChevronDown size={12} className={cn('transition-transform', openShelf && 'rotate-180')} aria-hidden />
                </button>
              )}
            </div>
            {!folded && (
              <ul className="flex flex-col divide-y divide-border">
                {es.map((e) => (
                  <li key={e.key} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
                    <Poster e={e} className="w-10" />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate text-sm font-semibold text-foreground">{e.title}</span>
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                        <span>{e.fact}</span>
                        {e.service && e.kind !== 'on_services' && <span className="rounded border border-primary/50 px-1.5 py-px font-mono text-[10px] uppercase tracking-wider text-foreground">On {e.service.name}</span>}
                      </span>
                    </span>
                    {/* Phones: the choices drop to their own line under the title. */}
                    <div className="flex w-full flex-wrap gap-2 pl-13 sm:w-auto sm:pl-0">
                      {choicesFor(e).map((c) => (
                        <ChoiceButton key={c.choice} label={c.label} primary={isPrimary(e, c.choice)} disabled={tidy.busy} onClick={() => tidy.apply([e], c.choice)} />
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
      {!tidy.entries.length && <p className="text-sm text-muted-foreground">That&apos;s everything. The list is as you want it.</p>}
    </section>
  );
}
