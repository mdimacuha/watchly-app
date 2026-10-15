import React, { useState, useRef, useEffect } from 'react';
import { Search as SearchIcon, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

export interface Suggestion {
  id: string;
  title: string;
  year?: string;
  mediaType: 'movie' | 'tv';
  image?: string;
}

interface WatchlySearchProps {
  variant?: 'default' | 'compact';
  placeholder?: string;
  defaultValue?: string;
  isLoading?: boolean;
  error?: string | null;
  suggestions?: Suggestion[];
  onSubmit?: (query: string) => void;
  onChange?: (query: string) => void;
  onSelectSuggestion?: (id: string) => void;
  className?: string;
}

export function WatchlySearch({
  variant = 'default',
  placeholder = 'Search movies or shows...',
  defaultValue = '',
  isLoading = false,
  error,
  suggestions = [],
  onSubmit,
  onChange,
  onSelectSuggestion,
  className,
}: WatchlySearchProps) {
  const [query, setQuery] = useState(defaultValue);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setQuery(newValue);
    setIsOpen(true);
    setActiveIndex(-1);
    onChange?.(newValue);
  };

  const handleSubmit = () => {
    if (!query.trim()) return;
    setIsOpen(false);

    if (onSubmit) {
      onSubmit(query);
    } else {
      // Default behavior: navigate to search page
      router.push(`/search?q=${encodeURIComponent(query)}`);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0 && suggestions[activeIndex]) {
        onSelectSuggestion?.(suggestions[activeIndex].id);
      } else {
        handleSubmit();
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) =>
        prev < suggestions.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => (prev > -1 ? prev - 1 : prev));
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      inputRef.current?.blur();
    }
  };

  const clearSearch = () => {
    setQuery('');
    setIsOpen(false);
    onChange?.('');
    inputRef.current?.focus();
  };

  return (
    <div
      ref={containerRef}
      className={cn('relative w-full max-w-2xl', className)}
    >
      <div
        className={cn(
          'relative flex items-center bg-card border transition-all duration-200',
          error
            ? 'border-destructive/50'
            : 'border-border hover:border-primary/50 focus-within:border-primary focus-within:ring-2 focus-within:ring-ring',
          variant === 'compact' ? 'h-10 rounded-full' : 'h-12 rounded-xl'
        )}
      >
        <SearchIcon
          className={cn(
            'ml-3 text-muted-foreground',
            variant === 'compact' ? 'w-4 h-4' : 'w-5 h-5'
          )}
        />

        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={isLoading}
          className={cn(
            'flex-1 bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground px-3 w-full',
            variant === 'compact' ? 'text-sm' : 'text-base'
          )}
          aria-label="Search movies and shows"
          aria-expanded={isOpen}
          aria-autocomplete="list"
          aria-controls="search-suggestions"
          role="combobox"
        />

        {query && !isLoading && (
          <button
            onClick={clearSearch}
            className="p-1 mr-2 rounded-full hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Clear search"
          >
            <X className={cn(variant === 'compact' ? 'w-3 h-3' : 'w-4 h-4')} />
          </button>
        )}

        {isLoading ? (
          <div className="mr-3">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
          </div>
        ) : (
          <Button
            onClick={handleSubmit}
            size={variant === 'compact' ? 'icon' : 'default'}
            className={cn(
              'm-1',
              variant === 'compact'
                ? 'h-8 w-8 rounded-full bg-primary/10 hover:bg-primary/20 text-primary shadow-none'
                : 'px-6 rounded-lg font-medium'
            )}
            aria-label="Submit search"
          >
            {variant === 'compact' ? (
              <SearchIcon className="w-4 h-4" />
            ) : (
              'Search'
            )}
          </Button>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <p className="absolute -bottom-6 left-0 text-xs text-destructive mt-1 ml-1">
          {error}
        </p>
      )}

      {/* Suggestions Dropdown */}
      {isOpen && suggestions.length > 0 && query && (
        <div
          id="search-suggestions"
          role="listbox"
          className="absolute top-full left-0 right-0 mt-2 py-2 bg-card border border-border rounded-xl shadow-xl shadow-black/50 z-50 overflow-hidden"
        >
          {suggestions.map((item, index) => (
            <div
              key={item.id}
              role="option"
              aria-selected={index === activeIndex}
              onClick={() => onSelectSuggestion?.(item.id)}
              onMouseEnter={() => setActiveIndex(index)}
              className={cn(
                'flex items-center gap-3 px-4 py-2 cursor-pointer transition-colors',
                index === activeIndex
                  ? 'bg-primary-soft'
                  : 'hover:bg-secondary/50'
              )}
            >
              {/* Poster Placeholder */}
              <div className="w-8 h-12 bg-secondary rounded-sm overflow-hidden shrink-0">
                {item.image ? (
                  <Image
                    src={item.image}
                    alt={item.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-secondary/80">
                    <SearchIcon className="w-3 h-3 text-muted-foreground/50" />
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <p
                  className={cn(
                    'text-sm font-medium truncate',
                    index === activeIndex ? 'text-primary' : 'text-foreground'
                  )}
                >
                  {item.title}
                </p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{item.year}</span>
                  <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
                  <span className="uppercase tracking-wider font-semibold text-[10px]">
                    {item.mediaType}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
