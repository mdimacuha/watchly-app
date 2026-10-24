'use client';

import type { RefObject } from 'react';
import { useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import { replaceQuery } from '@/lib/urlState';

/** One page of a poster grid: 6 columns × 3 rows at the widest. */
export const GRID_PAGE_SIZE = 18;

/**
 * Client-side paging for a list the page already holds. The page lives in
 * the URL (`?page=`, or `pageParam`) so refresh and share keep it, written
 * with the History API so nothing is refetched. Out-of-range pages clamp.
 * `anchor` (the grid's own ref) is scrolled back into view on a page change.
 */
export function usePaged<T>(items: T[], opts: { size?: number; param?: string; anchor?: RefObject<HTMLElement | null> } = {}) {
  const size = opts.size ?? GRID_PAGE_SIZE;
  const param = opts.param ?? 'page';
  const searchParams = useSearchParams();
  const pages = Math.max(1, Math.ceil(items.length / size));
  const raw = Number(searchParams.get(param));
  const page = Number.isInteger(raw) && raw >= 1 ? Math.min(raw, pages) : 1;

  const go = (next: number) => {
    const p = Math.min(Math.max(1, next), pages);
    const q = new URLSearchParams(searchParams.toString());
    if (p === 1) q.delete(param);
    else q.set(param, String(p));
    replaceQuery(q);
    // Back to the top of the grid, not the top of the page.
    const el = opts.anchor?.current;
    if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };

  return { page, pages, size, slice: items.slice((page - 1) * size, page * size), go, total: items.length };
}

/**
 * Page controls under a grid: ← 1 2 … 7 → with "19–36 of 64". Hidden when
 * everything fits on one page. Arrow buttons and page numbers are real
 * buttons; the current page is marked for screen readers.
 */
export function PageStrip({ page, pages, size, total, go, className, label = 'titles' }: { page: number; pages: number; size: number; total: number; go: (p: number) => void; className?: string; label?: string }) {
  if (pages <= 1) return null;
  const from = (page - 1) * size + 1;
  const to = Math.min(page * size, total);
  // 1 … p-1 p p+1 … N, never more than 7 slots.
  const nums: (number | 'gap')[] = [];
  for (let n = 1; n <= pages; n++) {
    if (n === 1 || n === pages || Math.abs(n - page) <= 1) nums.push(n);
    else if (nums[nums.length - 1] !== 'gap') nums.push('gap');
  }
  const btn = 'inline-flex h-9 min-w-9 cursor-pointer items-center justify-center rounded-md px-2 text-sm font-semibold tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-30';
  return (
    <nav aria-label="Pages" className={cn('flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4', className)}>
      <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
        {from}–{to} of {total} {label}
      </span>
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => go(page - 1)} disabled={page === 1} aria-label="Previous page" className={cn(btn, 'text-muted-foreground hover:bg-secondary hover:text-foreground')}>
          <ChevronLeft size={16} aria-hidden />
        </button>
        {nums.map((n, i) =>
          n === 'gap' ? (
            <span key={`g${i}`} aria-hidden className="px-1 text-muted-foreground">
              …
            </span>
          ) : (
            <button key={n} type="button" onClick={() => go(n)} aria-current={n === page ? 'page' : undefined} aria-label={`Page ${n}`} className={cn(btn, n === page ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary hover:text-foreground')}>
              {n}
            </button>
          ),
        )}
        <button type="button" onClick={() => go(page + 1)} disabled={page === pages} aria-label="Next page" className={cn(btn, 'text-muted-foreground hover:bg-secondary hover:text-foreground')}>
          <ChevronRight size={16} aria-hidden />
        </button>
      </div>
    </nav>
  );
}
