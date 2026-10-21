import { Clock, FlaskConical, RefreshCw, Sparkles, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

export type StatusPillKind = 'beta' | 'new' | 'updated' | 'soon' | 'experimental';

interface StatusPillProps {
  kind: StatusPillKind;
  /** Optional override for the kind's default label. */
  label?: string;
  /** Tighter padding + smaller font — used inline next to sidebar labels. */
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * Small chip that flags where a feature stands:
 *   beta         — works, still being tuned (amber)
 *   new          — recently launched (Watchly blue, from the logo)
 *   updated      — an existing page changed meaningfully (emerald)
 *   soon         — placeholder, not open yet (muted outline)
 *   experimental — beta with the long label, for page headers
 * Palette colours rather than theme tokens, so they read the same
 * whatever accent the user picked.
 */
const KINDS: Record<StatusPillKind, { label: string; icon: LucideIcon; className: string }> = {
  beta: { label: 'Beta', icon: FlaskConical, className: 'border-yellow-500/40 bg-yellow-500/15 text-yellow-200' },
  experimental: { label: 'Experimental', icon: FlaskConical, className: 'border-yellow-500/40 bg-yellow-500/15 text-yellow-200' },
  new: { label: 'New', icon: Sparkles, className: 'border-blue-400/40 bg-blue-500/15 text-blue-300' },
  updated: { label: 'Updated', icon: RefreshCw, className: 'border-emerald-400/40 bg-emerald-400/15 text-emerald-200' },
  soon: { label: 'Soon', icon: Clock, className: 'border-border bg-transparent text-muted-foreground' },
};

export function StatusPill({ kind, label, size = 'md', className }: StatusPillProps) {
  const { label: defaultLabel, icon: Icon, className: tone } = KINDS[kind];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border font-semibold uppercase tracking-wider whitespace-nowrap',
        tone,
        size === 'sm' ? 'px-1.5 py-0.5 text-[9px] gap-0.5' : 'px-2 py-0.5 text-[10px]',
        className,
      )}
    >
      <Icon className={size === 'sm' ? 'w-2.5 h-2.5' : 'w-3 h-3'} strokeWidth={2.5} aria-hidden />
      {label ?? defaultLabel}
    </span>
  );
}
