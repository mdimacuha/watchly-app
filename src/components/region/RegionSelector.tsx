'use client';

import { useState, useMemo, useEffect } from 'react';
import { Search, Check, MapPin, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { getAllCountries, type Country } from '@/lib/regions/countries';
import { toFlagEmoji } from '@/lib/regions/flags';
import { cn } from '@/lib/cn';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const POPULAR_REGION_CODES = ['US', 'GB', 'CA', 'AU', 'PH', 'JP'];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface RegionSelectorProps {
  /** Currently selected region code (e.g. "PH"). */
  selectedRegion: string | null;
  /** Called when the user taps a country row. */
  onSelect: (code: string, name: string) => void;
  /** If true, show an auto-detect button below the search bar. */
  showAutoDetect?: boolean;
  /** Called when auto-detect resolves. Receives the detected code + name. */
  onAutoDetect?: (code: string, name: string) => void;
  /** Tailwind classes applied to the outer wrapper. */
  className?: string;
}

// ---------------------------------------------------------------------------
// Shared country row
// ---------------------------------------------------------------------------

function CountryItem({
  country,
  isSelected,
  onSelect,
}: {
  country: Country;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full flex items-center justify-between p-3 rounded-lg text-left transition-colors cursor-pointer',
        'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 focus:ring-offset-background',
        isSelected
          ? 'bg-primary/10 border border-primary/50'
          : 'hover:bg-secondary/50 border border-transparent',
      )}
    >
      <div className="flex items-center gap-3">
        <span className="text-xl" role="img" aria-label={`Flag of ${country.name}`}>
          {toFlagEmoji(country.code)}
        </span>
        <span
          className={cn(
            'font-medium',
            isSelected ? 'text-foreground' : 'text-muted-foreground',
          )}
        >
          {country.name}
        </span>
      </div>
      {isSelected && <Check size={18} className="text-primary" />}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Auto-detect button
// ---------------------------------------------------------------------------

function AutoDetectButton({
  onDetect,
}: {
  onDetect: (code: string, name: string) => void;
}) {
  const [isLoading, setIsLoading] = useState(false);

  const handleAutoDetect = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/geo/ipapi');
      if (!res.ok) throw new Error('Geo lookup failed');

      const data = await res.json();
      const code: string | undefined = data.data?.countryCode ?? data.countryCode;
      if (!code) throw new Error('No country code returned');

      const allCountries = getAllCountries();
      const match = allCountries.find((c) => c.code === code);
      onDetect(code, match?.name ?? code);
    } catch (err) {
      console.error('Auto-detect failed:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleAutoDetect}
      disabled={isLoading}
      className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {isLoading ? (
        <Loader2 size={16} className="animate-spin" />
      ) : (
        <MapPin size={16} />
      )}
      <span>{isLoading ? 'Detecting...' : 'Auto-detect my region'}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RegionSelector({
  selectedRegion,
  onSelect,
  showAutoDetect = true,
  onAutoDetect,
  className,
}: RegionSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 150);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const allCountries = useMemo(() => getAllCountries(), []);

  const popularRegions = useMemo(
    () => allCountries.filter((c) => POPULAR_REGION_CODES.includes(c.code)),
    [allCountries],
  );

  const filteredCountries = useMemo(() => {
    if (!debouncedQuery) return allCountries;
    const lowerQ = debouncedQuery.toLowerCase();
    return allCountries.filter(
      (c) =>
        c.name.toLowerCase().includes(lowerQ) ||
        c.code.toLowerCase().includes(lowerQ),
    );
  }, [allCountries, debouncedQuery]);

  const showSections = !debouncedQuery;

  const handleAutoDetect = (code: string, name: string) => {
    if (onAutoDetect) {
      onAutoDetect(code, name);
    } else {
      onSelect(code, name);
    }
  };

  return (
    <div className={cn('flex flex-col', className)}>
      {/* Search input */}
      <div className="mb-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search country or region..."
            className="pl-9 bg-secondary/30 border-border/50"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Auto-detect button */}
      {showAutoDetect && (
        <div className="mb-2">
          <AutoDetectButton onDetect={handleAutoDetect} />
        </div>
      )}

      {/* Scrollable list */}
      <div className="flex-1 overflow-y-auto pr-1 -mr-1 space-y-6 no-scrollbar">
        {showSections ? (
          <>
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pl-1">
                Popular Regions
              </h4>
              <div className="space-y-1">
                {popularRegions.map((country) => (
                  <CountryItem
                    key={country.code}
                    country={country}
                    isSelected={selectedRegion === country.code}
                    onSelect={() => onSelect(country.code, country.name)}
                  />
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pl-1">
                All Regions
              </h4>
              <div className="space-y-1">
                {allCountries.map((country) => (
                  <CountryItem
                    key={country.code}
                    country={country}
                    isSelected={selectedRegion === country.code}
                    onSelect={() => onSelect(country.code, country.name)}
                  />
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="space-y-1">
            {filteredCountries.length > 0 ? (
              filteredCountries.map((country) => (
                <CountryItem
                  key={country.code}
                  country={country}
                  isSelected={selectedRegion === country.code}
                  onSelect={() => onSelect(country.code, country.name)}
                />
              ))
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No regions found
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
