'use client';

import React, { useEffect } from 'react';
import { cn } from '@/lib/cn';
import { X } from 'lucide-react';

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
}

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  className,
  hideCloseButton = false,
}: ModalProps) {
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        className={cn(
          'relative w-full max-w-4xl bg-background rounded-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]',
          className
        )}
        role="dialog"
        aria-modal="true"
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
        <div className="flex-1 overflow-auto p-0">{children}</div>
      </div>
    </div>
  );
}
