'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/cn';
import { StatusPill } from '@/components/watchly/StatusPill';
import {
  setSidebarPrefs,
  useSidebarPrefs,
  type FloatGap,
  type SidebarStyle,
  type TonightShow,
} from '@/client/sidebarPrefs';
import { SwitchRow } from './parts';

const TONIGHT: { value: TonightShow; label: string; sentence: string }[] = [
  { value: 'both', label: 'Both', sentence: "Tonight's feature on top, the shows you're in the middle of below it." },
  { value: 'feature', label: "Tonight's feature", sentence: 'Just one pick for tonight, with Swap for another.' },
  { value: 'ticket', label: 'On your ticket', sentence: "Just what you're watching or waiting on, one tap from each." },
  { value: 'off', label: 'Off', sentence: "Nothing under the menu. Tonight's Programme is still in Discover." },
];

const GAPS: { value: FloatGap; label: string }[] = [
  { value: 'snug', label: 'Snug' },
  { value: 'roomy', label: 'Roomy' },
];

/** Segmented choice, the same look as the privacy pickers. Four wrap to two rows on phones. */
function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn('grid gap-1 rounded-md bg-secondary p-1', options.length > 3 ? 'grid-cols-2 sm:grid-cols-4' : options.length === 3 ? 'grid-cols-3' : 'grid-cols-2')}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-sm px-2 py-2 text-sm font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            value === o.value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * A tiny drawing of the screen: the sidebar flush with the edge, or a slim
 * rail floating off it. Shows the difference faster than words.
 */
function StyleSketch({ style, active }: { style: SidebarStyle; active: boolean }) {
  const floating = style === 'floating';
  return (
    <span aria-hidden className="relative block h-20 overflow-hidden rounded-md border border-border bg-background">
      {floating ? (
        <span
          className={cn(
            'absolute inset-y-1.5 left-1.5 flex w-5 flex-col items-center gap-1.5 rounded-lg border border-border bg-secondary py-2 shadow-md transition-colors',
            active && 'border-foreground/25',
          )}
        >
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={cn('h-1.5 w-1.5 rounded-full', i === 1 ? 'bg-primary' : 'bg-muted-foreground/40')} />
          ))}
        </span>
      ) : (
        <span
          className={cn(
            'absolute inset-y-0 left-0 flex w-[30%] flex-col gap-1 border-r border-border bg-secondary p-1.5 transition-colors',
            active && 'border-foreground/25',
          )}
        >
          {[70, 50, 60, 45].map((w, i) => (
            <span key={i} className={cn('h-1 rounded-full', i === 1 ? 'bg-primary' : 'bg-muted-foreground/40')} style={{ width: `${w}%` }} />
          ))}
        </span>
      )}
      <span className={cn('absolute inset-y-2.5 right-2.5 flex flex-col gap-1.5', floating ? 'left-10' : 'left-[36%]')}>
        <span className="h-2 w-1/2 rounded-full bg-muted-foreground/30" />
        <span className="h-6 w-full rounded bg-muted-foreground/15" />
        <span className="h-1.5 w-3/4 rounded-full bg-muted-foreground/20" />
      </span>
    </span>
  );
}

function StyleCard({ style, title, sentence, pill }: { style: SidebarStyle; title: string; sentence: string; pill?: boolean }) {
  const prefs = useSidebarPrefs();
  const on = prefs.style === style;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={() => setSidebarPrefs({ style })}
      className={cn(
        'flex flex-col gap-3 rounded-lg border p-3 text-left transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        on ? 'border-primary bg-primary/5' : 'border-border hover:border-foreground/30',
      )}
    >
      <StyleSketch style={style} active={on} />
      <span className="flex flex-col gap-0.5">
        <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
          {title}
          {pill && <StatusPill kind="experimental" size="sm" />}
        </span>
        <span className="text-xs text-muted-foreground">{sentence}</span>
      </span>
    </button>
  );
}

/** Settings › Sidebar: what the Tonight ticket shows, and how the sidebar sits. */
export function SidebarControls() {
  const prefs = useSidebarPrefs();
  const reduce = useReducedMotion();
  const floating = prefs.style === 'floating';

  return (
    <div className="flex flex-col gap-8">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold text-foreground">Tonight in the sidebar</legend>
        <Segmented label="Tonight in the sidebar" value={prefs.tonight} options={TONIGHT} onChange={(tonight) => setSidebarPrefs({ tonight })} />
        <p className="text-xs text-muted-foreground">{TONIGHT.find((t) => t.value === prefs.tonight)?.sentence}</p>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-sm font-semibold text-foreground">Sidebar style</legend>
        <div role="radiogroup" aria-label="Sidebar style" className="grid gap-3 sm:grid-cols-2">
          <StyleCard style="docked" title="Docked" sentence="Fixed to the left edge of the screen. The steady default." />
          <StyleCard style="floating" title="Floating" sentence="A slim rail off the edge that opens over the page when you point at it. Still being tuned." pill />
        </div>

        {/* Floating's own options, only while it's picked. */}
        <AnimatePresence initial={false}>
          {floating && (
            <motion.div
              key="floating-options"
              initial={reduce ? false : { height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="overflow-hidden"
            >
              <div className="ml-1 mt-1 border-l-2 border-border pl-4">
                <p className="pt-1 text-xs text-muted-foreground">On computers. Phones keep the full-screen menu.</p>
                <div className="divide-y divide-border">
                  <SwitchRow
                    label="Keep it open"
                    sentence="The full sidebar stays open beside the page instead of folding to a rail. The pin at its top does the same."
                    checked={prefs.pinned}
                    onChange={(pinned) => setSidebarPrefs({ pinned })}
                  />
                  <SwitchRow
                    label="Translucent"
                    sentence="The page shows softly through the sidebar. Off makes it solid."
                    checked={prefs.translucent}
                    onChange={(translucent) => setSidebarPrefs({ translucent })}
                  />
                  <SwitchRow
                    label="Fluid motion"
                    sentence={
                      reduce
                        ? 'Off while your device asks for reduced motion.'
                        : 'The highlight glides to each page you open and follows your pointer, and the sidebar springs as it opens and closes.'
                    }
                    checked={prefs.fluid && !reduce}
                    disabled={!!reduce}
                    onChange={(fluid) => setSidebarPrefs({ fluid })}
                  />
                  <div className="flex flex-col gap-2 py-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">Distance from the edge</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">How far the sidebar floats from the sides of the screen.</p>
                    </div>
                    <div className="max-w-xs">
                      <Segmented label="Distance from the edge" value={prefs.gap} options={GAPS} onChange={(gap) => setSidebarPrefs({ gap })} />
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <p className="text-xs text-muted-foreground">Saved to your account, so every device you sign in on gets the same sidebar.</p>
      </fieldset>
    </div>
  );
}
