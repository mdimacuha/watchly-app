'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';

// Define a context to share state between Select components
interface SelectContextType {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  value: string;
  onValueChange: (value: string) => void;
  // Map value -> ReactNode (label)
  options: Map<string, React.ReactNode>;
  registerOption: (val: string, label: React.ReactNode) => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
}

const SelectContext = React.createContext<SelectContextType | null>(null);

function useSelect() {
  const context = React.useContext(SelectContext);
  if (!context) {
    throw new Error('Select components must be used within a Select provider');
  }
  return context;
}

interface SelectProps {
  children: React.ReactNode;
  value: string;
  onValueChange: (value: string) => void;
}

export function Select({ children, value, onValueChange }: SelectProps) {
  const [open, setOpen] = React.useState(false);
  // Store options map in state to trigger re-renders when options are registered
  const [options, setOptions] = React.useState(
    new Map<string, React.ReactNode>()
  );
  const triggerRef = React.useRef<HTMLButtonElement>(null);

  const registerOption = React.useCallback(
    (val: string, label: React.ReactNode) => {
      setOptions(prev => {
        // Avoid unnecessary updates if already registered
        if (prev.get(val) === label) return prev;
        const next = new Map(prev);
        next.set(val, label);
        return next;
      });
    },
    []
  );

  return (
    <SelectContext.Provider
      value={{
        open,
        setOpen,
        value,
        onValueChange,
        options,
        registerOption,
        triggerRef,
      }}
    >
      <div className="relative inline-block w-auto min-w-[140px]">
        {children}
      </div>
    </SelectContext.Provider>
  );
}

export const SelectGroup = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('', className)} {...props} />
));
SelectGroup.displayName = 'SelectGroup';

export const SelectValue = React.forwardRef<
  HTMLSpanElement,
  React.HTMLAttributes<HTMLSpanElement> & { placeholder?: string }
>(({ className, placeholder, children, ...props }, ref) => {
  const { value, options } = useSelect();
  const display =
    children || options.get(value) || (value ? value : placeholder);

  return (
    <span
      ref={ref}
      className={cn('pointer-events-none block truncate', className)}
      {...props}
    >
      {display}
    </span>
  );
});
SelectValue.displayName = 'SelectValue';

export const SelectTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ className, children, ...props }, ref) => {
  const { open, setOpen, triggerRef } = useSelect();

  // Compose refs manually
  const composedRef = React.useCallback(
    (node: HTMLButtonElement) => {
      // Update the context ref
      if (triggerRef) {
        triggerRef.current = node;
      }
      // Update the forwarded ref
      if (typeof ref === 'function') {
        ref(node);
      } else if (ref) {
        (ref as React.MutableRefObject<HTMLButtonElement | null>).current =
          node;
      }
    },
    [ref, triggerRef]
  );

  return (
    <button
      ref={composedRef}
      type="button"
      onClick={() => setOpen(!open)}
      className={cn(
        'flex h-9 w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1',
        className
      )}
      {...props}
    >
      {children}
      <ChevronDown className="h-4 w-4 opacity-50 ml-2" />
    </button>
  );
});
SelectTrigger.displayName = 'SelectTrigger';

export const SelectContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => {
  const { open, setOpen, triggerRef } = useSelect();
  const [position, setPosition] = React.useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (open && triggerRef.current) {
      const updatePosition = () => {
        if (triggerRef.current) {
          const rect = triggerRef.current.getBoundingClientRect();
          setPosition({
            top: rect.bottom + window.scrollY + 4, // +4px margin
            left: rect.left + window.scrollX,
            width: rect.width,
          });
        }
      };

      updatePosition();

      // Update on resize/scroll
      window.addEventListener('resize', updatePosition);
      window.addEventListener('scroll', updatePosition, true); // true for capture to catch all scrolls

      return () => {
        window.removeEventListener('resize', updatePosition);
        window.removeEventListener('scroll', updatePosition, true);
      };
    }
  }, [open, triggerRef]);

  // Click outside handler for Portal
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // Check if click is inside trigger
      if (
        triggerRef.current &&
        triggerRef.current.contains(event.target as Node)
      ) {
        return;
      }
      // Check if click is inside content
      if (
        contentRef.current &&
        contentRef.current.contains(event.target as Node)
      ) {
        return;
      }
      setOpen(false);
    };

    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [open, setOpen, triggerRef]);

  if (!open) return null;
  if (!position && open) return null; // Wait for position calculation

  // Compose content ref
  const composedRef = (node: HTMLDivElement) => {
    (contentRef as React.MutableRefObject<HTMLDivElement | null>).current =
      node;
    if (typeof ref === 'function') ref(node);
    else if (ref)
      (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
  };

  return createPortal(
    <div
      ref={composedRef}
      style={{
        top: position?.top,
        left: position?.left,
        width: position?.width,
        position: 'absolute',
      }}
      className={cn(
        'z-[9999] min-w-32 overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md animate-in fade-in-80 zoom-in-95',
        className
      )}
      {...props}
    >
      <div className="max-h-96 overflow-y-auto p-1 bg-popover text-popover-foreground no-scrollbar">
        {children}
      </div>
    </div>,
    document.body
  );
});
SelectContent.displayName = 'SelectContent';

export const SelectLabel = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('px-2 py-1.5 text-sm font-semibold', className)}
    {...props}
  />
));
SelectLabel.displayName = 'SelectLabel';

interface SelectItemProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
}

export const SelectItem = React.forwardRef<HTMLDivElement, SelectItemProps>(
  ({ className, children, value, ...props }, ref) => {
    const {
      value: selectedValue,
      onValueChange,
      setOpen,
      registerOption,
    } = useSelect();
    const isSelected = selectedValue === value;

    React.useLayoutEffect(() => {
      registerOption(value, children);
    }, [value, children, registerOption]);

    return (
      <div
        ref={ref}
        onClick={e => {
          e.stopPropagation();
          onValueChange(value);
          setOpen(false);
        }}
        className={cn(
          'relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50',
          isSelected && 'bg-accent text-accent-foreground',
          className
        )}
        {...props}
      >
        <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
          {isSelected && <Check className="h-4 w-4" />}
        </span>
        <span className="truncate">{children}</span>
      </div>
    );
  }
);
SelectItem.displayName = 'SelectItem';

export const SelectSeparator = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('-mx-1 my-1 h-px bg-muted', className)}
    {...props}
  />
));
SelectSeparator.displayName = 'SelectSeparator';
