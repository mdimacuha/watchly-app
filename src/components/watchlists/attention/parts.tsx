'use client';

import Image from 'next/image';
import { cn } from '@/lib/cn';
import type { AttentionEntry } from '@/services/watchlists/attention';
import type { AttentionKind } from '@/services/watchlists/attentionKinds';
import type { Choice } from './useTidy';

// Shared parts of Needs your attention (the /watchlists strip) and Tidy up
// (inside a list). Copy rules: facts, never guilt; no ages in the alert;
// Keep comes first on quiet titles and weighs the same as every other choice.

/** Tidy up sections, in order. The shelf is last and starts folded. */
export const SECTIONS: { kind: AttentionKind; title: string; blurb: string }[] = [
  { kind: 'seen', title: 'Already seen', blurb: 'You logged these, but the list still has them to watch.' },
  { kind: 'wait_over', title: 'Your wait is over', blurb: 'You were waiting for these. Something new has aired.' },
  { kind: 'left', title: 'Left your services', blurb: 'On one of your services at the last check, and not now.' },
  { kind: 'on_services', title: 'On your screens', blurb: 'Streaming now on one of your services.' },
  { kind: 'still_on', title: 'Still on?', blurb: 'In progress or up next, and quiet for a while.' },
  { kind: 'dust', title: 'On the shelf a while', blurb: 'Saved a while back. A backlog is allowed to be old.' },
];

export const KIND_LABEL: Record<AttentionKind, string> = {
  seen: 'Already seen',
  wait_over: 'Wait is over',
  left: 'Left your services',
  on_services: 'On your screens',
  still_on: 'Still on?',
  dust: 'On the shelf',
};

/** The choices for a suggestion, in order. Keep / "Not this one" are remembered; "Not tonight" is for this visit. */
export function choicesFor(e: AttentionEntry): { choice: Choice; label: string }[] {
  switch (e.kind) {
    case 'seen':
      return [{ choice: 'finish', label: 'Mark finished' }, { choice: 'keep', label: 'Not this one' }];
    case 'wait_over':
      return [{ choice: 'watching', label: 'Back to Watching' }, { choice: 'keep', label: 'Keep waiting' }];
    case 'left':
      return [{ choice: 'keep', label: 'Keep' }, { choice: 'remove', label: 'Let it go' }];
    case 'on_services':
      return e.status === 'up_next'
        ? [{ choice: 'watching', label: 'Start watching' }, { choice: 'skip', label: 'Not tonight' }]
        : [{ choice: 'up_next', label: 'Move to Up Next' }, { choice: 'skip', label: 'Not tonight' }];
    case 'still_on':
      return e.status === 'watching'
        ? // The likeliest truth: they finished and never marked it.
          [{ choice: 'finish', label: 'Finished it' }, { choice: 'keep', label: 'Still watching' }, { choice: 'pause', label: 'Pause' }, { choice: 'drop', label: 'Drop' }]
        : [{ choice: 'keep', label: 'Keep' }, { choice: 'watching', label: 'Start watching' }, { choice: 'drop', label: 'Drop' }];
    case 'dust':
      return [{ choice: 'keep', label: 'Keep' }, { choice: 'up_next', label: 'Move to Up Next' }, { choice: 'remove', label: 'Let it go' }];
  }
}

/** The fix is primary, except on Keep-first rows, where every choice weighs the same. */
export const isPrimary = (e: AttentionEntry, c: Choice) =>
  e.kind === 'still_on' ? c === 'finish' : e.kind === 'dust' || e.kind === 'left' ? false : c !== 'keep' && c !== 'skip';

/**
 * Page-reported events at most once per key every few seconds: a remount (dev
 * Strict Mode, a refresh after a save) must not count as a second visit.
 */
const lastLogged = new Map<string, number>();
export function onceFor(key: string, run: () => void, windowMs = 5000) {
  const now = Date.now();
  if (now - (lastLogged.get(key) ?? 0) < windowMs) return;
  lastLogged.set(key, now);
  run();
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** One line of Intermission: the fact, said as a sentence. */
export function sentence(e: AttentionEntry): string {
  switch (e.kind) {
    case 'seen':
      return `${e.fact}, still marked to watch in ${e.listName}.`;
    case 'wait_over':
      return `${e.fact.replace(' · ', ', ')}. You were waiting for it.`;
    case 'left':
      return `${e.fact}. It's in ${e.listName}.`;
    default:
      return `${e.fact}, and it's in ${e.listName}.`;
  }
}

export function Poster({ e, className }: { e: AttentionEntry; className?: string }) {
  return (
    <span className={cn('relative block aspect-[2/3] shrink-0 overflow-hidden rounded-sm bg-secondary ring-1 ring-border', className)}>
      {e.poster && <Image src={e.poster} alt="" fill sizes="96px" className="object-cover" />}
    </span>
  );
}

/** One choice. `primary` = the fix; the rest are outlined at the same size. */
export function ChoiceButton({ label, primary, onClick, disabled, className }: { label: string; primary?: boolean; onClick: () => void; disabled?: boolean; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex h-8 cursor-pointer items-center rounded-md px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
        primary ? 'bg-primary text-primary-foreground hover:bg-primary-hover' : 'border border-border text-foreground hover:bg-secondary',
        className,
      )}
    >
      {label}
    </button>
  );
}
