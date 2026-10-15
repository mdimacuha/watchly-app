'use client';

import { useEffect } from 'react';
import {
  CheckCircle2,
  XCircle,
  Info,
  AlertTriangle,
  Loader2,
  X,
} from 'lucide-react';
import type { Toast, ToastType } from '@/client/stores/toast';
import { useToastStore } from '@/client/stores/toast';
import { cn } from '@/lib/cn';

// ---------------------------------------------------------------------------
// Type-to-style mappings
// ---------------------------------------------------------------------------

const ACCENT_COLORS: Record<ToastType, string> = {
  success: 'bg-emerald-500',
  error: 'bg-red-500',
  info: 'bg-blue-500',
  warning: 'bg-amber-500',
  loading: 'bg-indigo-500',
};

const ICON_COLORS: Record<ToastType, string> = {
  success: 'text-emerald-500',
  error: 'text-red-500',
  info: 'text-blue-500',
  warning: 'text-amber-500',
  loading: 'text-indigo-500',
};

const ICONS: Record<ToastType, React.ElementType> = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
  warning: AlertTriangle,
  loading: Loader2,
};

const DEFAULT_DURATION = 4000;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ToastItemProps {
  toast: Toast;
}

export function ToastItem({ toast }: ToastItemProps) {
  const removeToast = useToastStore((s) => s.removeToast);

  const {
    id,
    title,
    description,
    type,
    variant = 'default',
    duration = DEFAULT_DURATION,
    actionLabel,
    onAction,
  } = toast;

  // Auto-dismiss logic
  useEffect(() => {
    if (type === 'loading' || variant === 'persistent') return;

    const timer = setTimeout(() => removeToast(id), duration);
    return () => clearTimeout(timer);
  }, [id, type, variant, duration, removeToast]);

  const Icon = ICONS[type];
  const showClose = type !== 'loading';
  const showAction = variant === 'action' && actionLabel;

  return (
    <div
      role="status"
      aria-live="polite"
      className="relative flex items-stretch overflow-hidden rounded-md border border-white/8 bg-card/40 backdrop-blur-md shadow-[0_4px_24px_-4px_rgba(0,0,0,0.5)]"
    >
      {/* Left accent bar */}
      <div className={cn('w-[3px] shrink-0 rounded-l-xl', ACCENT_COLORS[type])} />

      {/* Content area */}
      <div className="flex items-start gap-3 px-4 py-3.5 flex-1 min-w-0">
        {/* Icon */}
        <div className={cn('shrink-0 mt-0.5', ICON_COLORS[type])}>
          <Icon size={18} className={type === 'loading' ? 'animate-spin' : ''} />
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground leading-snug">
            {title}
          </p>
          {description && (
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              {description}
            </p>
          )}
        </div>

        {/* Action button */}
        {showAction && (
          <button
            type="button"
            onClick={onAction}
            className="shrink-0 text-xs font-medium text-foreground underline underline-offset-2 hover:text-primary transition-colors cursor-pointer self-center"
          >
            {actionLabel}
          </button>
        )}

        {/* Close button */}
        {showClose && (
          <button
            type="button"
            onClick={() => removeToast(id)}
            className="shrink-0 p-0.5 rounded text-muted-foreground hover:text-foreground transition-colors cursor-pointer self-start"
            aria-label="Dismiss"
          >
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
