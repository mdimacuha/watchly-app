import { cn } from '@/lib/cn';

/**
 * Tiny set of skeleton primitives used by every `loading.tsx` in the
 * app. Standardised on `bg-foreground/10 animate-pulse` so the skeletons
 * read on both dark + light themes (the existing favorites loading used
 * `bg-muted/20` which is dim on light — this updates it).
 */

interface BoxProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
}

export function SkeletonBox({ className, ...props }: BoxProps) {
  return (
    <div
      className={cn(
        'rounded-md bg-foreground/10 animate-pulse',
        className,
      )}
      {...props}
    />
  );
}

/** Standard page header (icon + title). */
export function PageHeaderSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <SkeletonBox className="h-6 w-6 rounded" />
      <SkeletonBox className="h-7 w-48" />
    </div>
  );
}

/** Poster-card cell (2:3 aspect ratio + two text lines below). */
export function PosterCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <SkeletonBox className="aspect-[2/3] w-full rounded-lg" />
      <SkeletonBox className="h-4 w-3/4" />
      <SkeletonBox className="h-3 w-1/2" />
    </div>
  );
}

/**
 * Standard responsive poster grid (matches the grid used across favorites,
 * collections, search results, etc). Renders `count` PosterCardSkeleton cells.
 */
export function PosterGridSkeleton({
  count = 12,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4',
        className,
      )}
    >
      {Array.from({ length: count }).map((_, i) => (
        <PosterCardSkeleton key={i} />
      ))}
    </div>
  );
}

/** List-row skeleton (avatar + 2-line text + optional right thumb). */
export function ListRowSkeleton({
  withThumb = false,
  className,
}: {
  withThumb?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('flex items-start gap-3 py-4', className)}>
      <SkeletonBox className="h-10 w-10 rounded-full shrink-0" />
      <div className="flex-1 min-w-0 pt-0.5 flex flex-col gap-2">
        <SkeletonBox className="h-4 w-2/3" />
        <SkeletonBox className="h-3 w-1/4" />
      </div>
      {withThumb && (
        <SkeletonBox className="hidden sm:block w-11 h-[66px] rounded-md ml-auto" />
      )}
    </div>
  );
}

/** Card-shaped block — for settings sub-pages, account-edit forms, etc. */
export function CardBlockSkeleton({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-card p-6 flex flex-col gap-4',
        className,
      )}
    >
      <SkeletonBox className="h-5 w-1/3" />
      <SkeletonBox className="h-4 w-1/2 opacity-70" />
      <div className="flex flex-col gap-3 pt-2">
        {Array.from({ length: lines }).map((_, i) => (
          <SkeletonBox key={i} className="h-10 w-full" />
        ))}
      </div>
    </div>
  );
}
