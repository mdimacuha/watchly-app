'use client';

import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/cn';
import { X } from 'lucide-react';
import { useAuthStore } from '@/client/stores/auth';
import { AccentScope } from '@/components/profile/AccentScope';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
  /**
   * Suppress the built-in top-right close button. Use when full-bleed content
   * (e.g. a video embed) needs to own its own close affordance so the X does
   * not overlap the content.
   */
  hideCloseButton?: boolean;
  /** Extra classes for the scrolling body (e.g. `no-scrollbar`). */
  bodyClassName?: string;
  /** id of the element that names the dialog, when the content renders its own heading. */
  labelledBy?: string;
}

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  className,
  hideCloseButton = false,
  bodyClassName,
  labelledBy,
}: ModalProps) {
  const accentColor = useAuthStore((s) => s.user?.accentColor ?? null);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';

      const handleEsc = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
      };
      window.addEventListener('keydown', handleEsc);

      return () => {
        document.body.style.overflow = '';
        window.removeEventListener('keydown', handleEsc);
      };
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;
  // Modals only open after a client interaction, so document exists here.
  if (typeof document === 'undefined') return null;

  // Portaled to <body>: a transformed ancestor (e.g. a 3D-tilt card) turns
  // `position: fixed` into "relative to that ancestor", which clipped and
  // mispositioned modals opened from inside it. That also puts modals outside
  // the layout's AccentScope, so the root re-applies the viewer's accent
  // (a nested AccentScope inside a modal still wins).
  return createPortal(
    <AccentScope
      accentColor={accentColor}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        className={cn(
          // min-w-0: as a flex item the panel would otherwise grow to its content's
          // min-content width (nowrap button rows, provider strips) and run off
          // the right edge of small screens.
          'relative w-full min-w-0 max-w-4xl bg-background rounded-lg shadow-2xl overflow-hidden flex flex-col max-h-[90dvh]',
          className
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
      >
        {title && <h3 className="font-semibold text-lg">{title}</h3>}
        {!hideCloseButton && (
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-white/10 transition-colors absolute top-4 right-4 cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        )}
        <div className={cn('min-w-0 flex-1 overflow-auto overflow-x-hidden p-0', bodyClassName)}>{children}</div>
      </div>
    </AccentScope>,
    document.body,
  );
}
