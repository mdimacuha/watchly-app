'use client';

import { forwardRef } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

interface IconButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  /** Size of the lucide icon in px. Default 18. */
  iconSize?: number;
  /** Badge count. Hidden when 0 or undefined. */
  count?: number;
  /** Max value shown before displaying "9+", "99+", etc. Default 99. */
  maxCount?: number;
  /** Visual size variant. */
  size?: 'sm' | 'md';
}

const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    {
      icon: Icon,
      iconSize = 18,
      count,
      maxCount = 99,
      size = 'md',
      className,
      ...props
    },
    ref,
  ) => {
    const showBadge = count !== undefined && count > 0;
    const displayCount = showBadge
      ? count > maxCount
        ? `${maxCount}+`
        : String(count)
      : null;

    return (
      <button
        ref={ref}
        type="button"
        className={cn(
          'relative inline-flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors cursor-pointer',
          size === 'sm' ? 'w-8 h-8' : 'w-9 h-9',
          className,
        )}
        {...props}
      >
        <Icon size={iconSize} />

        {showBadge && (
          <span
            className={cn(
              'absolute flex items-center justify-center rounded-full bg-red-500 text-white font-bold leading-none',
              displayCount!.length === 1
                ? 'w-4 h-4 text-[9px] -top-0.5 -right-0.5'
                : 'h-4 min-w-4 px-1 text-[9px] -top-0.5 -right-1',
            )}
          >
            {displayCount}
          </span>
        )}
      </button>
    );
  },
);

IconButton.displayName = 'IconButton';

export { IconButton };
