'use client';

import { forwardRef, useEffect, useId, useImperativeHandle, useRef, useState } from 'react';
import Image from 'next/image';
import { Check, Loader2, Plus, Search } from 'lucide-react';
import { cn } from '@/lib/cn';
import { buildImageUrl } from '@/lib/tmdb';
import { useDebounce } from '@/hooks/useDebounce';
import { useToast } from '@/hooks/useToast';
import { addToWatchlistAction, removeFromWatchlistAction } from '@/actions/watchlists';
import type { SearchResponse } from '@/types/tmdb';

type Result = { id: number; mediaType: 'movie' | 'tv'; title: string; year: string | null; posterPath: string | null };

export interface AddTitleSearchHandle {
  focus: () => void;
}

/**
 * "Add a title": the list's search-to-add, in the toolbar (owner only).
 * Type to search films and shows; ↑ ↓ to move, Enter to add, Esc to close.
 * "/" focuses it from anywhere on the page. Each add has Undo. A combobox
 * per the ARIA pattern: the input owns a listbox of results.
 */
export const AddTitleSearch = forwardRef<AddTitleSearchHandle, { watchlistId: string; existingKeys: Set<string>; onAdded: () => void; className?: string; autoFocus?: boolean }>(function AddTitleSearch(
  { watchlistId, existingKeys, onAdded, className, autoFocus },
  ref,
) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [q, setQ] = useState('');
  const debounced = useDebounce(q.trim(), 250);
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<Result[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState(0);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState<string | null>(null);

  useImperativeHandle(ref, () => ({ focus: () => input.current?.focus() }));

  // "/" focuses the search, unless the member is typing somewhere else.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.closest('input, textarea, select, [contenteditable="true"]') || t.isContentEditable)) return;
      e.preventDefault();
      input.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!debounced) {
      setResults(null);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setFailed(false);
    fetch(`/api/v1/tmdb/search?q=${encodeURIComponent(debounced)}&type=all`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error('search failed');
        const data: SearchResponse = await res.json();
        setResults(
          data.results
            .filter((r) => r.mediaType === 'movie' || r.mediaType === 'tv')
            .slice(0, 8)
            .map((r) => ({ id: r.id, mediaType: r.mediaType as 'movie' | 'tv', title: r.title, year: r.year ?? null, posterPath: r.posterPath })),
        );
        setActive(0);
        setLoading(false);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setFailed(true);
        setLoading(false);
      });
    return () => controller.abort();
  }, [debounced]);

  const isAdded = (k: string) => existingKeys.has(k) || added.has(k);

  async function add(r: Result) {
    const key = `${r.mediaType}:${r.id}`;
    if (isAdded(key) || adding) return;
    setAdding(key);
    try {
      await addToWatchlistAction(watchlistId, r.mediaType, String(r.id), 'search');
      setAdded((s) => new Set(s).add(key));
      onAdded();
      toast.custom({
        title: `Added: ${r.title}`,
        type: 'success',
        variant: 'action',
        duration: 6000,
        actionLabel: 'Undo',
        onAction: () => {
          setAdded((s) => {
            const n = new Set(s);
            n.delete(key);
            return n;
          });
          void removeFromWatchlistAction(watchlistId, r.mediaType, String(r.id))
            .then(onAdded)
            .catch(() => toast.error('Could not undo', 'Reload and try again.'));
        },
      });
    } catch (err) {
      toast.error('Could not add', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setAdding(null);
    }
  }

  const show = open && q.trim().length > 0;
  const optionId = (i: number) => `${listId}-o${i}`;

  return (
    <div className={cn('relative', className)}>
      <label htmlFor={`${listId}-input`} className="sr-only">
        Add a title to this list
      </label>
      <Search size={15} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
      <input
        ref={input}
        id={`${listId}-input`}
        type="search"
        role="combobox"
        aria-expanded={show}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={show && results?.length ? optionId(active) : undefined}
        autoComplete="off"
        autoFocus={autoFocus}
        placeholder="Add a title…"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setOpen(false);
            return;
          }
          if (!results?.length) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, results.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            void add(results[active]);
          }
        }}
        className="h-9 w-full rounded-md border border-border bg-card pl-9 pr-9 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <kbd aria-hidden className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-border px-1.5 font-mono text-[10px] text-muted-foreground">
        /
      </kbd>

      {show && (
        <div className="absolute left-0 right-0 top-full z-40 mt-1 overflow-hidden rounded-lg border border-border bg-card shadow-elevation-card">
          {loading && !results ? (
            <p className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
              <Loader2 size={14} className="animate-spin motion-reduce:animate-none" aria-hidden /> Searching…
            </p>
          ) : failed ? (
            <p className="px-3 py-3 text-sm text-muted-foreground">Search isn&apos;t answering. Try again in a moment.</p>
          ) : results && results.length === 0 ? (
            <p className="px-3 py-3 text-sm text-muted-foreground">Nothing found for &ldquo;{q.trim()}&rdquo;.</p>
          ) : (
            <ul id={listId} role="listbox" aria-label="Titles to add" className="max-h-96 overflow-y-auto py-1">
              {(results ?? []).map((r, i) => {
                const key = `${r.mediaType}:${r.id}`;
                const done = isAdded(key);
                const poster = buildImageUrl(r.posterPath, 'w92');
                return (
                  <li
                    key={key}
                    id={optionId(i)}
                    role="option"
                    aria-selected={i === active}
                    aria-disabled={done}
                    onMouseEnter={() => setActive(i)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => void add(r)}
                    className={cn('flex cursor-pointer items-center gap-3 px-3 py-2', i === active && 'bg-secondary', done && 'cursor-default')}
                  >
                    <span className="relative h-12 w-8 shrink-0 overflow-hidden rounded-sm bg-secondary">{poster && <Image src={poster} alt="" fill sizes="32px" className="object-cover" />}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-foreground">{r.title}</span>
                      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                        {r.mediaType === 'movie' ? 'Film' : 'Series'}
                        {r.year ? ` · ${r.year}` : ''}
                      </span>
                    </span>
                    {done ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground">
                        <Check size={13} aria-hidden /> On this list
                      </span>
                    ) : adding === key ? (
                      <Loader2 size={14} className="animate-spin text-muted-foreground motion-reduce:animate-none" aria-label="Adding" />
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary">
                        <Plus size={13} aria-hidden /> Add
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
});
