import { cn } from '@/lib/cn';

interface ReasonBadgeProps {
  children: React.ReactNode;
  /** Subtle = muted card-style; primary = accented for hero. */
  tone?: 'subtle' | 'primary';
  className?: string;
}

export function ReasonBadge({
  children,
  tone = 'subtle',
  className,
}: ReasonBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] uppercase tracking-wider font-semibold border',
        tone === 'primary'
          ? 'bg-primary/15 text-primary border-primary/30'
          : 'bg-card text-muted-foreground border-border',
        className,
      )}
    >
      {children}
    </span>
  );
}
