import { FlaskConical } from 'lucide-react';
import { cn } from '@/lib/cn';

interface ExperimentalBadgeProps {
  /** Optional override for the label. Default: "Experimental". */
  label?: string;
  /** Tighter padding + smaller font — used inline next to sidebar labels. */
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * Small yellow chip used to flag features that aren't fully production
 * ready. Used in two surfaces today: next to the page header on
 * /swipe and next to the "Watchly Swipe" sidebar item. Hard-coded
 * amber tokens since the chip needs to read as a warning in both dark
 * and light themes.
 */
export function ExperimentalBadge({
  label = 'Experimental',
  size = 'md',
  className,
}: ExperimentalBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-yellow-500/40 bg-yellow-500/15 text-yellow-200 font-semibold uppercase tracking-wider whitespace-nowrap',
        size === 'sm'
          ? 'px-1.5 py-0.5 text-[9px] gap-0.5'
          : 'px-2 py-0.5 text-[10px]',
        className,
      )}
    >
      <FlaskConical
        className={size === 'sm' ? 'w-2.5 h-2.5' : 'w-3 h-3'}
        strokeWidth={2.5}
      />
      {label}
    </span>
  );
}
