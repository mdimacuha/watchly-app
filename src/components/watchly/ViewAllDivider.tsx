'use client';

import { cn } from '@/lib/cn';

interface ViewAllDividerProps {
  expanded: boolean;
  /** Total items, shown as "View all N". */
  total: number;
  onToggle: () => void;
  className?: string;
}

/**
 * "──── VIEW ALL N ────" divider that expands a truncated list in place, then
 * reads "SHOW LESS". Used under capped lists (seasons in Quick View and on
 * the title page).
 */
export function ViewAllDivider({ expanded, total, onToggle, className }: ViewAllDividerProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      className={cn(
        'group flex w-full items-center gap-3 py-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors cursor-pointer',
        className,
      )}
    >
      <span className="h-px flex-1 bg-border group-hover:bg-foreground/30 transition-colors" />
      {expanded ? 'Show less' : `View all ${total}`}
      <span className="h-px flex-1 bg-border group-hover:bg-foreground/30 transition-colors" />
    </button>
  );
}
