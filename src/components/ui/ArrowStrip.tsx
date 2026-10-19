'use client';

import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * Wraps one horizontally scrolling row (its single child) with caret buttons
 * at the edges, each shown only while there is more to see that way. Use it
 * for every sideways-scrolling strip so touchpad/mouse users without
 * horizontal scroll can still move through it.
 */
export function ArrowStrip({ label, children }: { label: string; children: React.ReactElement }) {
  const [wrap, setWrap] = useState<HTMLDivElement | null>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  // The scroller is the wrapper's first child; track its scroll position and size.
  useEffect(() => {
    const el = wrap?.firstElementChild as HTMLElement | null | undefined;
    if (!el) return;
    const update = () =>
      setEdges({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      ro.disconnect();
    };
  }, [wrap]);

  const page = (dir: -1 | 1) => {
    const el = wrap?.firstElementChild as HTMLElement | null | undefined;
    el?.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' });
  };

  const arrow = 'absolute top-1/2 z-10 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-md transition-colors hover:bg-secondary cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
  return (
    <div ref={setWrap} className="relative">
      {children}
      {edges.left && (
        <button type="button" onClick={() => page(-1)} aria-label={`Scroll ${label} left`} className={cn(arrow, '-left-2')}>
          <ChevronLeft className="h-4 w-4" />
        </button>
      )}
      {edges.right && (
        <button type="button" onClick={() => page(1)} aria-label={`Scroll ${label} right`} className={cn(arrow, '-right-2')}>
          <ChevronRight className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
