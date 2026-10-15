'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { useRegionStore } from '@/client/stores/region';
import { toFlagEmoji } from '@/lib/regions/flags';
import { RegionPicker } from './RegionPicker';
import { cn } from '@/lib/cn';

interface RegionButtonProps {
  collapsed?: boolean;
}

export function RegionButton({ collapsed = false }: RegionButtonProps) {
  const { regionCode, regionName } = useRegionStore();
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const [pickerPos, setPickerPos] = useState<{ bottom: number; left: number } | null>(null);

  // Calculate picker position relative to the viewport
  const updatePosition = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    setPickerPos({
      bottom: window.innerHeight - rect.top + 8,
      left: rect.left,
    });
  }, []);

  // Position the picker when it opens
  useEffect(() => {
    if (!isOpen) return;
    updatePosition();
  }, [isOpen, updatePosition]);

  // Close picker when clicking outside
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        buttonRef.current?.contains(target) ||
        pickerRef.current?.contains(target)
      ) {
        return;
      }
      setIsOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  return (
    <>
      <div className={cn(collapsed ? 'px-1.5' : 'px-3')}>
        <button
          ref={buttonRef}
          type="button"
          onClick={() => setIsOpen((o) => !o)}
          title={collapsed ? `You are in ${regionName}` : undefined}
          className={cn(
            'flex items-center rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors cursor-pointer',
            collapsed
              ? 'justify-center w-11 h-11 mx-auto'
              : 'gap-2.5 w-full px-3 py-2.5',
          )}
        >
          {regionCode ? (
            <>
              <span className="text-base">{toFlagEmoji(regionCode)}</span>
              {!collapsed && <span>You are in {regionName}</span>}
            </>
          ) : (
            !collapsed && <span>Select region</span>
          )}
        </button>
      </div>

      {/* Render picker in a portal so it escapes sidebar overflow */}
      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {isOpen && pickerPos && (
              <div
                ref={pickerRef}
                className="fixed z-70"
                style={{ bottom: pickerPos.bottom, left: pickerPos.left }}
              >
                <RegionPicker onClose={() => setIsOpen(false)} />
              </div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}
