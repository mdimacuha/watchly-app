'use client';

import { useEffect, useState } from 'react';
import { Settings } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { SettingsSnapshot } from '@/services/settings/snapshot';
import { useSettings, type SettingsState } from './useSettings';
import { BlockedList, Kicker, PrivacyControls, SECTIONS, SectionBody, VisitorCard, type SectionId } from './parts';

// /settings: one page, a numbered ledger of sections titled by the question
// people arrive with (01 Privacy — "Who can see my stuff?" …), with a sticky
// index (a chip rail on phones). Privacy leads with "what visitors see"
// pinned beside its controls, updating as they change.

export function SettingsPage({ snapshot }: { snapshot: SettingsSnapshot }) {
  const s = useSettings(snapshot);
  const current = useSectionInView();

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-8">
      <header className="mb-8 flex flex-col gap-1">
        <h1 className="flex items-center gap-2.5 text-h2">
          <Settings className="h-6 w-6 text-primary" aria-hidden /> Settings
        </h1>
        <p className="text-sm text-muted-foreground">Everything on one page, by the question you came with.</p>
      </header>

      <div className="lg:grid lg:grid-cols-[190px_minmax(0,1fr)] lg:gap-10">
        <nav
          aria-label="Settings sections"
          className="sticky top-0 z-10 -mx-4 mb-6 bg-background/95 px-4 py-2 lg:top-6 lg:mx-0 lg:mb-0 lg:self-start lg:bg-transparent lg:p-0"
        >
          <ol className="no-scrollbar flex gap-1.5 overflow-x-auto lg:flex-col lg:gap-0.5">
            {SECTIONS.map((x, i) => (
              <li key={x.id} className="shrink-0">
                <a
                  href={`#settings-${x.id}`}
                  aria-current={current === x.id ? 'true' : undefined}
                  className={cn(
                    'flex items-baseline gap-2 rounded-md px-3 py-1.5 text-sm whitespace-nowrap transition-colors lg:whitespace-normal',
                    current === x.id ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <span className="font-mono text-[10px] tabular-nums">{String(i + 1).padStart(2, '0')}</span>
                  {x.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="flex min-w-0 flex-col">
          {SECTIONS.map((x, i) => (
            <section
              key={x.id}
              id={`settings-${x.id}`}
              aria-labelledby={`settings-h-${x.id}`}
              className="scroll-mt-20 border-t border-border py-10 first:border-t-0 first:pt-0 lg:scroll-mt-6"
            >
              <Kicker className="mb-1">
                {String(i + 1).padStart(2, '0')} · {x.title}
              </Kicker>
              <h2 id={`settings-h-${x.id}`} className="mb-6 text-h3">
                {x.question}
              </h2>
              {x.id === 'privacy' ? <PrivacySection s={s} /> : <SectionBody id={x.id} s={s} />}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Privacy: your profile as visitors see it, pinned beside the controls that change it. */
function PrivacySection({ s }: { s: SettingsState }) {
  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <div className="xl:sticky xl:top-6 xl:self-start">
        <VisitorCard s={s} />
      </div>
      <div className="flex flex-col gap-8">
        <PrivacyControls s={s} />
        <BlockedList s={s} />
      </div>
    </div>
  );
}

/** The section nearest the top of the viewport, for the index highlight. */
function useSectionInView(): SectionId {
  const [current, setCurrent] = useState<SectionId>('privacy');
  useEffect(() => {
    const els = SECTIONS.map((x) => document.getElementById(`settings-${x.id}`)).filter((e): e is HTMLElement => !!e);
    const io = new IntersectionObserver(
      (entries) => {
        const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) setCurrent(top.target.id.replace('settings-', '') as SectionId);
      },
      { rootMargin: '-20% 0px -70% 0px' },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, []);
  return current;
}
