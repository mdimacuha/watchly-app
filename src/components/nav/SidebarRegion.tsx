'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence } from 'framer-motion';
import { ChevronsUpDown } from 'lucide-react';
import { useRegionStore } from '@/client/stores/region';
import { RegionPicker } from '@/components/region/RegionPicker';
import { cn } from '@/lib/cn';

/**
 * Where you're browsing from, said in words: every "On Netflix" in the app is
 * for this country. The code sits in a small stamp (flag emoji don't render
 * on Windows, which showed a bare "PH"). Opens the region picker; the rail
 * shows the stamp alone.
 */
export function SidebarRegion({ collapsed = false }: { collapsed?: boolean }) {
  const { regionCode, regionName } = useRegionStore();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ bottom: number; left: number } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const picker = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!button.current?.contains(t) && !picker.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggle = () => {
    const r = button.current?.getBoundingClientRect();
    if (r) setPos({ bottom: window.innerHeight - r.top + 8, left: r.left });
    setOpen((o) => !o);
  };

  const stamp = (
    <span className="flex h-6 w-8 shrink-0 items-center justify-center rounded border border-white/15 font-mono text-[10px] font-semibold tracking-wider text-foreground">
      {regionCode || '—'}
    </span>
  );
  const label = regionCode ? `You're currently in ${regionName}. Change region` : 'Choose your region';

  return (
    <>
      {collapsed ? (
        <button
          ref={button}
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-label={label}
          title={label}
          className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg hover:bg-white/5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {stamp}
        </button>
      ) : (
        <button
          ref={button}
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-label={label}
          className={cn(
            'group flex w-full items-center gap-3 rounded-lg border bg-white/[0.03] px-3 py-2 text-left transition-colors cursor-pointer',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            open ? 'border-white/25' : 'border-white/10 hover:border-white/20',
          )}
        >
          {stamp}
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-[11px] leading-tight text-muted-foreground">{regionCode ? "You're currently in" : 'Where are you watching?'}</span>
            <span className="truncate text-[13px] font-medium leading-snug text-foreground">{regionCode ? regionName : 'Choose your region'}</span>
          </span>
          <ChevronsUpDown size={14} className="shrink-0 text-muted-foreground group-hover:text-foreground" aria-hidden />
        </button>
      )}

      {/* Portal so the picker escapes the sidebar's overflow. */}
      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {open && pos && (
              <div ref={picker} data-sidebar-layer tabIndex={-1} className="fixed z-70 outline-none" style={{ bottom: pos.bottom, left: pos.left }}>
                <RegionPicker onClose={() => setOpen(false)} />
              </div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}
