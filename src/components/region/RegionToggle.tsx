'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { useRegionStore } from '@/client/stores/region';
import { toFlagEmoji } from '@/lib/regions/flags';
import { cn } from '@/lib/cn';
import { RegionPicker } from './RegionPicker';

interface RegionToggleProps {
  className?: string;
}

export function RegionToggle({ className }: RegionToggleProps) {
  const { regionCode, regionName } = useRegionStore();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current?.contains(e.target as Node)) return;
      setIsOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setIsOpen((o) => !o)}
        className="flex items-center gap-2 px-3 h-9 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors cursor-pointer"
      >
        {regionCode ? (
          <>
            <span className="text-base leading-none">
              {toFlagEmoji(regionCode)}
            </span>
            <span className="hidden sm:inline">{regionName}</span>
          </>
        ) : (
          <span>Select region</span>
        )}
        <ChevronDown className="w-3.5 h-3.5" />
      </button>

      <AnimatePresence>
        {isOpen && (
          <div className="absolute right-0 top-full mt-2 z-50">
            <RegionPicker onClose={() => setIsOpen(false)} />
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
