'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, BellRing, Info, PlayCircle, Ticket, type LucideIcon } from 'lucide-react';
import { PATHS } from '@/lib/app';
import { cn } from '@/lib/cn';

const WIDTH = 300;
const MARGIN = 12;

const PARTS: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Ticket,
    title: "Tonight's feature",
    body: "The top pick from Tonight's Programme, chosen from what you love. Swap shows the next one.",
  },
  {
    icon: BellRing,
    title: 'Just landed',
    body: 'When a title you follow arrives on a service, it takes the top spot first.',
  },
  {
    icon: PlayCircle,
    title: 'On your ticket',
    body: "Titles you set to Watching or are waiting on in your watchlists. Nothing there? The last titles you opened.",
  },
];

/**
 * The "i" beside Tonight: what the ticket is, where each part comes from,
 * and that Settings can trim it or turn it off. Opens beside the sidebar
 * (below the button when there's no room, as in the phone menu), in a
 * portal so the sidebar's scrolling doesn't clip it.
 */
export function TonightInfo({ onNavigate }: { onNavigate: () => void }) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const id = useId();
  const open = pos !== null;

  const place = () => {
    const b = button.current?.getBoundingClientRect();
    const side = button.current?.closest('aside')?.getBoundingClientRect();
    if (!b) return null;
    const vw = window.innerWidth;
    // Beside the sidebar when it fits, otherwise under the button.
    if (side && side.right + MARGIN + WIDTH <= vw - MARGIN) {
      return { left: side.right + MARGIN, top: Math.max(MARGIN, b.top - 14) };
    }
    return { left: Math.max(MARGIN, Math.min(b.left - 16, vw - WIDTH - MARGIN)), top: b.bottom + 8 };
  };

  const close = (refocus = false) => {
    setPos(null);
    if (refocus) button.current?.focus();
  };

  // Once it has a height, nudge it up so it never runs off the bottom.
  useLayoutEffect(() => {
    const h = panel.current?.offsetHeight;
    if (!pos || !h) return;
    const top = Math.max(MARGIN, Math.min(pos.top, window.innerHeight - MARGIN - h));
    if (top !== pos.top) setPos({ ...pos, top });
  }, [pos]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!button.current?.contains(t) && !panel.current?.contains(t)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close(true);
    // It's pinned to where the button was: any scroll or resize closes it.
    const onMove = (e: Event) => {
      if (!panel.current?.contains(e.target as Node)) close();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [open]);

  return (
    <>
      <button
        ref={button}
        type="button"
        onClick={() => (open ? close() : setPos(place()))}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label="What is Tonight?"
        className={cn(
          'flex h-5 w-5 items-center justify-center rounded-full transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          open ? 'text-foreground' : 'text-muted-foreground/70 hover:text-foreground',
        )}
      >
        <Info size={13} aria-hidden />
      </button>

      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {pos && (
              <motion.div
                ref={panel}
                id={id}
                role="dialog"
                data-sidebar-layer
                // Focusable, so clicking inside keeps focus "in the sidebar".
                tabIndex={-1}
                aria-label="About Tonight"
                initial={reduce ? { opacity: 0 } : { opacity: 0, x: -6, scale: 0.98 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.16, ease: 'easeOut' }}
                style={{ top: pos.top, left: pos.left, width: WIDTH }}
                className="fixed z-[80] origin-top-left outline-none overflow-hidden rounded-xl border border-border bg-card text-foreground shadow-[0_18px_48px_-18px_rgb(0_0_0/0.8)]"
              >
                <div className="px-4 pb-3 pt-3.5">
                  <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    <span className="h-3 w-0.5 rounded-full bg-primary" aria-hidden />
                    Tonight
                  </p>
                  <p className="mt-1.5 text-sm font-semibold leading-snug">Your answer to &ldquo;what should I watch tonight?&rdquo;</p>
                </div>

                <ul className="flex flex-col gap-3 border-t border-border px-4 py-3.5">
                  {PARTS.map((p) => (
                    <li key={p.title} className="flex gap-3">
                      <p.icon size={15} className="mt-0.5 shrink-0 text-primary" aria-hidden />
                      <span className="min-w-0">
                        <span className="block text-[13px] font-medium">{p.title}</span>
                        <span className="block text-xs leading-relaxed text-muted-foreground">{p.body}</span>
                      </span>
                    </li>
                  ))}
                </ul>

                <div className="flex items-center justify-between gap-3 border-t border-border bg-secondary/40 px-4 py-3">
                  <p className="text-xs text-muted-foreground">Show one half, or turn it off.</p>
                  <Link
                    href={`${PATHS.SETTINGS.ROOT}#settings-sidebar`}
                    onClick={() => {
                      close();
                      onNavigate();
                    }}
                    className="inline-flex shrink-0 items-center gap-1 rounded-md bg-foreground px-2.5 py-1.5 text-xs font-semibold text-background transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Customize <ArrowRight size={12} aria-hidden />
                  </Link>
                </div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}
