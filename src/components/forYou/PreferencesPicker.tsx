'use client';

import { useMemo, useState, useTransition } from 'react';
import { Check, Search } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/useToast';
import { updateForYouPreferencesAction } from '@/actions/forYouPrefs';
import type { CatalogProvider } from '@/server/tmdb/providersCatalog';

interface PreferencesPickerProps {
  initialSelected: number[] | null;
  catalog: CatalogProvider[];
  /** Optional: called after save with the resulting selection. */
  onSaved?: (next: number[]) => void;
}

/**
 * Searchable list of TMDB providers. Click a row to toggle membership.
 * "Save" persists the selection; on success we toast and (optionally)
 * forward the saved state up to a parent modal.
 */
export function PreferencesPicker({
  initialSelected,
  catalog,
  onSaved,
}: PreferencesPickerProps) {
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(initialSelected ?? []),
  );
  const [query, setQuery] = useState('');
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return catalog;
    return catalog.filter((p) => p.provider_name.toLowerCase().includes(q));
  }, [catalog, query]);

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearAll = () => setSelected(new Set());

  const handleSave = () => {
    startTransition(async () => {
      try {
        const next = Array.from(selected);
        await updateForYouPreferencesAction(next);
        toast.success(
          next.length === 0
            ? 'Filter cleared — showing any region provider'
            : `Filtering Tonight's Programme to ${next.length} service${next.length === 1 ? '' : 's'}`,
        );
        onSaved?.(next);
      } catch {
        toast.error('Could not save', 'Please try again.');
      }
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search services…"
          className="pl-9"
        />
      </div>

      <div className="max-h-[400px] overflow-y-auto scrollbar-thin -mx-1 px-1 flex flex-col gap-1">
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No matches for &ldquo;{query}&rdquo;.
          </p>
        ) : (
          filtered.map((p) => {
            const isSelected = selected.has(p.provider_id);
            return (
              <button
                key={p.provider_id}
                type="button"
                onClick={() => toggle(p.provider_id)}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-md text-left text-sm cursor-pointer transition-colors',
                  isSelected
                    ? 'bg-primary/15 text-foreground'
                    : 'hover:bg-foreground/5',
                )}
              >
                <span
                  className={cn(
                    'w-5 h-5 rounded-md border flex items-center justify-center shrink-0',
                    isSelected
                      ? 'bg-primary border-primary'
                      : 'border-border',
                  )}
                >
                  {isSelected && (
                    <Check className="w-3 h-3 text-primary-foreground text-white" />
                  )}
                </span>
                <span className="flex-1 min-w-0 truncate">{p.provider_name}</span>
              </button>
            );
          })
        )}
      </div>

      <div className="flex items-center justify-between gap-3 pt-2 border-t border-border">
        <span className="text-xs text-muted-foreground">
          {selected.size === 0
            ? 'No filter — showing any provider'
            : `${selected.size} selected`}
        </span>
        <div className="flex gap-2">
          {selected.size > 0 && (
            <Button
              variant="outline"
              onClick={clearAll}
              disabled={pending}
              className="h-8 px-3 text-xs"
            >
              Clear
            </Button>
          )}
          <Button
            onClick={handleSave}
            disabled={pending}
            className="h-8 px-4 text-xs"
          >
            {pending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  );
}
