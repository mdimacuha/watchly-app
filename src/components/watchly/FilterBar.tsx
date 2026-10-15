import React, { useRef } from 'react';
import { cn } from '@/lib/cn';
import { Badge } from '@/components/ui/badge';

interface FilterOption {
  id: string;
  label: string;
}

interface FilterBarProps {
  filters: FilterOption[];
  activeFilterId?: string;
  onSelect: (id: string) => void;
  className?: string;
}

export function FilterBar({
  filters,
  activeFilterId,
  onSelect,
  className,
}: FilterBarProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  return (
    <div className={cn('w-full relative group', className)}>
      {/* 
        Responsive Behavior:
        - Mobile/Tablet (< lg): Horizontal Scroll (overflow-x-auto)
        - Desktop (>= lg): Flex Wrap (flex-wrap) or Grid, typically specific to layout context.
          However, per spec, desktop is "Filters fully visible". 
          We'll default to a flex-wrap layout for desktop and scroll for mobile.
      */}
      <div
        ref={scrollContainerRef}
        className={cn(
          'flex items-center gap-2 overflow-x-auto no-scrollbar pb-2 lg:mask-none lg:flex-wrap lg:overflow-visible lg:pb-0'
        )}
      >
        {filters.map((filter) => {
          const isActive = activeFilterId === filter.id;
          return (
            <button
              key={filter.id}
              onClick={() => onSelect(filter.id)}
              className="focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-pill"
            >
              <Badge
                variant={isActive ? 'default' : 'outline'}
                className={cn(
                  'cursor-pointer px-4 py-1.5 h-8 text-sm whitespace-nowrap transition-all duration-200',
                  isActive
                    ? 'bg-primary hover:bg-primary/90 shadow-sm scale-100'
                    : 'bg-background hover:bg-secondary/80 hover:text-foreground border-border text-muted-foreground',
                  // Hover lift effect
                  'hover:-translate-y-0.5'
                )}
              >
                {filter.label}
              </Badge>
            </button>
          );
        })}
      </div>

      {/* Scroll Hint Gradient (Mobile Only - visible if scrollable) */}
      <div className="absolute right-0 top-0 bottom-2 w-8 bg-linear-to-l from-background to-transparent pointer-events-none lg:hidden opacity-0 group-hover:opacity-100 transition-opacity" />
    </div>
  );
}
