import React, { useState } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/cn';
import { X } from 'lucide-react';

const topNoticeBarVariants = cva(
  'w-full flex items-start sm:items-center justify-between px-4 py-3 text-sm transition-all duration-300 relative border-b',
  {
    variants: {
      variant: {
        info: 'bg-blue-950/30 border-blue-900/50 text-blue-200',
        warning: 'bg-amber-950/30 border-amber-900/50 text-amber-200',
        error: 'bg-red-950/30 border-red-900/50 text-red-200',
        accent: 'bg-primary/10 border-primary/20 text-primary-foreground', // using design system primary
      },
    },
    defaultVariants: {
      variant: 'info',
    },
  }
);

export interface TopNoticeBarProps extends VariantProps<typeof topNoticeBarVariants> {
  title?: string;
  message: string;
  icon?: React.ReactNode;
  action?: {
    label: string;
    onClick: () => void;
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
  dismissible?: boolean;
  onDismiss?: () => void;
  sticky?: boolean;
  className?: string;
}

export function TopNoticeBar({
  variant,
  title,
  message,
  icon,
  action,
  secondaryAction,
  dismissible = false,
  onDismiss,
  sticky = true,
  className,
}: TopNoticeBarProps) {
  const [isVisible, setIsVisible] = useState(true);

  if (!isVisible) return null;

  const handleDismiss = () => {
    setIsVisible(false);
    onDismiss?.();
  };

  const role = variant === 'warning' || variant === 'error' ? 'alert' : 'status';

  return (
    <div
      role={role}
      className={cn(
        topNoticeBarVariants({ variant }),
        sticky && 'sticky top-0 z-50',
        className
      )}
    >
      <div className="flex flex-1 items-start sm:items-center gap-3">
        {icon && <div className="flex-shrink-0 mt-0.5 sm:mt-0">{icon}</div>}
        
        <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 flex-1">
          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
            {title && <span className="font-semibold">{title}</span>}
            <span className={cn(title ? "opacity-90" : "")}>{message}</span>
          </div>
          
          {(action || secondaryAction) && (
            <div className="flex items-center gap-3 mt-2 sm:mt-0 sm:ml-auto flex-wrap">
              {action && (
                <button
                  onClick={action.onClick}
                  className="text-xs font-semibold hover:underline focus:outline-none focus:ring-1 focus:ring-offset-1 focus:ring-current rounded px-1 -ml-1 sm:ml-0"
                >
                  {action.label}
                </button>
              )}
              {secondaryAction && (
                <button
                  onClick={secondaryAction.onClick}
                  className="text-xs opacity-80 hover:opacity-100 hover:underline focus:outline-none focus:ring-1 focus:ring-offset-1 focus:ring-current rounded px-1"
                >
                  {secondaryAction.label}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {dismissible && (
        <button
          onClick={handleDismiss}
          aria-label="Dismiss"
          className="ml-3 flex-shrink-0 p-1 rounded-md opacity-70 hover:opacity-100 hover:bg-black/10 transition-colors focus:outline-none focus:ring-1 focus:ring-current"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
