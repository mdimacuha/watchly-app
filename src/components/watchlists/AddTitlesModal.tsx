'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import {
  Check,
  Film,
  Loader2,
  Plus,
  Search,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/watchly/EmptyState';
import { ErrorState } from '@/components/watchly/ErrorState';
import { PosterCardSkeleton } from '@/components/watchly/skeletons';
import { useDebounce } from '@/hooks/useDebounce';
import { useToast } from '@/hooks/useToast';
import { buildImageUrl } from '@/lib/tmdb';
import { cn } from '@/lib/cn';
import {
  addToWatchlistAction,
  getWatchlistRecommendationsAction,
} from '@/actions/watchlists';
import type { SearchResponse } from '@/types/tmdb';

type TabKey = 'search' | 'similar';

interface ResultEntry {
  id: number;
  mediaType: 'movie' | 'tv';
  title: string;
  year: string | null;
  posterPath: string | null;
}

// Both TMDB search items (`year?: string`) and recommendations
// (`year: string | null`) normalize into the same poster-ready shape.
function toEntry(r: {
  id: number;
  mediaType: 'movie' | 'tv';
  title: string;
  year?: string | null;
  posterPath: string | null;
}): ResultEntry {
  return {
    id: r.id,
    mediaType: r.mediaType,
    title: r.title,
    year: r.year ?? null,
    posterPath: r.posterPath,
  };
}

const GRID_CLASS = 'grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4';

interface AddTitlesModalProps {
  isOpen: boolean;
  onClose: () => void;
  watchlistId: string;
  /** `${type}:${mediaId}` keys already on the list, for dedupe. */
  existingKeys: Set<string>;
  /** Fired after each successful add so the parent can refresh its grid. */
  onAdded: () => void;
}

export function AddTitlesModal({
  isOpen,
  onClose,
  watchlistId,
  existingKeys,
  onAdded,
}: AddTitlesModalProps) {
  const toast = useToast();

  const [activeTab, setActiveTab] = useState<TabKey>('search');

  // --- Search tab state -----------------------------------------------------
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query.trim(), 350);
  const [searchResults, setSearchResults] = useState<ResultEntry[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState(false);
  // Bumped by the "Try again" button to re-run the current query's fetch.
  const [searchNonce, setSearchNonce] = useState(0);

  // --- Similar tab state ----------------------------------------------------
  const [similarResults, setSimilarResults] = useState<ResultEntry[] | null>(
    null,
  );
  const [similarLoading, setSimilarLoading] = useState(false);
  const [similarError, setSimilarError] = useState(false);
  // Guards against refetching recommendations every time the user toggles back
  // to the Similar tab within one open session. A REF (not state/deps) so
  // toggling the loading flag can't re-run the effect and cancel the in-flight
  // request. Bumping `similarNonce` (retry) re-runs the effect on demand.
  const similarLoadedRef = useRef(false);
  const [similarNonce, setSimilarNonce] = useState(0);

  // --- Add tracking ---------------------------------------------------------
  // Keys added during this session (merged with `existingKeys` for dedupe) and
  // keys with an in-flight add (for per-card spinners).
  const [addedKeys, setAddedKeys] = useState<Set<string>>(new Set());
  const [addingKeys, setAddingKeys] = useState<Set<string>>(new Set());

  // Reset the whole session each time the modal (re)opens. Legitimate
  // reset-on-open — the synchronous setStates run once per open.
  useEffect(() => {
    if (!isOpen) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActiveTab('search');
    setQuery('');
    setSearchResults(null);
    setSearchLoading(false);
    setSearchError(false);
    setSimilarResults(null);
    setSimilarLoading(false);
    setSimilarError(false);
    similarLoadedRef.current = false;
    setAddedKeys(new Set());
    setAddingKeys(new Set());
  }, [isOpen]);

  // Debounced search against the shared TMDB search endpoint.
  useEffect(() => {
    if (!isOpen) return;
    if (!debouncedQuery) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSearchResults(null);
      setSearchLoading(false);
      setSearchError(false);
      return;
    }

    const controller = new AbortController();
    setSearchLoading(true);
    setSearchError(false);

    fetch(
      `/api/v1/tmdb/search?q=${encodeURIComponent(debouncedQuery)}&type=all`,
      { signal: controller.signal },
    )
      .then(async (res) => {
        if (!res.ok) throw new Error('Search failed');
        const data: SearchResponse = await res.json();
        setSearchResults(data.results.map(toEntry));
        setSearchLoading(false);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setSearchError(true);
        setSearchLoading(false);
      });

    return () => controller.abort();
  }, [isOpen, debouncedQuery, searchNonce]);

  // Lazy-load recommendations the first time the Similar tab is opened. Deps
  // deliberately exclude the loading/loaded flags: including them would let
  // `setSimilarLoading(true)` re-run this effect, whose cleanup would cancel
  // the request it just started (leaving the tab stuck on skeletons). The
  // `similarLoadedRef` guard prevents refetch-on-tab-toggle; `similarNonce`
  // (bumped by retry) forces a fresh run.
  useEffect(() => {
    if (!isOpen || activeTab !== 'similar' || similarLoadedRef.current) return;

    let cancelled = false;
    setSimilarLoading(true);
    setSimilarError(false);

    getWatchlistRecommendationsAction(watchlistId)
      .then((data) => {
        if (cancelled) return;
        setSimilarResults(data.map(toEntry));
        similarLoadedRef.current = true;
      })
      .catch(() => {
        if (!cancelled) setSimilarError(true);
      })
      .finally(() => {
        if (!cancelled) setSimilarLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, activeTab, watchlistId, similarNonce]);

  const isAdded = (key: string) =>
    existingKeys.has(key) || addedKeys.has(key);

  const handleAdd = async (entry: ResultEntry) => {
    const key = `${entry.mediaType}:${entry.id}`;
    if (isAdded(key) || addingKeys.has(key)) return;

    setAddingKeys((prev) => new Set(prev).add(key));
    try {
      await addToWatchlistAction(watchlistId, entry.mediaType, String(entry.id));
      setAddedKeys((prev) => new Set(prev).add(key));
      onAdded();
      toast.success('Added', `"${entry.title}" added to this list.`);
    } catch (err) {
      toast.error(
        'Could not add',
        err instanceof Error ? err.message : 'Please try again.',
      );
    } finally {
      setAddingKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const retrySimilar = () => {
    similarLoadedRef.current = false;
    setSimilarError(false);
    setSimilarNonce((n) => n + 1);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-3xl">
      <div className="flex flex-col gap-4 p-6">
        <h2 className="text-lg font-semibold pr-8">Add titles</h2>

        {/* Tabs */}
        <div
          role="tablist"
          aria-label="Add titles"
          className="inline-flex items-center gap-1 rounded-full border border-border bg-card p-0.5 self-start"
        >
          <TabButton
            active={activeTab === 'search'}
            onClick={() => setActiveTab('search')}
            id="add-titles-tab-search"
            controls="add-titles-panel-search"
          >
            <Search className="w-3.5 h-3.5" />
            Search
          </TabButton>
          <TabButton
            active={activeTab === 'similar'}
            onClick={() => setActiveTab('similar')}
            id="add-titles-tab-similar"
            controls="add-titles-panel-similar"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Similar
          </TabButton>
        </div>

        {activeTab === 'search' ? (
          <div
            role="tabpanel"
            id="add-titles-panel-search"
            aria-labelledby="add-titles-tab-search"
            className="flex flex-col gap-4"
          >
            <div className="relative">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none"
                aria-hidden="true"
              />
              <Input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search movies and shows…"
                aria-label="Search movies and shows"
                className="pl-9"
              />
            </div>

            <ResultsArea
              loading={searchLoading}
              error={searchError}
              results={searchResults}
              onRetry={() => setSearchNonce((n) => n + 1)}
              emptyIcon={Film}
              emptyTitle={
                debouncedQuery ? 'No matches' : 'Search to add titles'
              }
              emptyDescription={
                debouncedQuery
                  ? 'Try a different title or spelling.'
                  : 'Find a movie or show by name, then add it to this list.'
              }
              errorTitle="Search failed"
              errorDescription="Something went wrong. Try again."
              isAdded={isAdded}
              addingKeys={addingKeys}
              onAdd={handleAdd}
            />
          </div>
        ) : (
          <div
            role="tabpanel"
            id="add-titles-panel-similar"
            aria-labelledby="add-titles-tab-similar"
            className="flex flex-col gap-4"
          >
            <ResultsArea
              loading={similarLoading}
              error={similarError}
              results={similarResults}
              onRetry={retrySimilar}
              emptyIcon={Sparkles}
              emptyTitle="No suggestions yet"
              emptyDescription="Add a few titles to this list and we'll suggest similar ones you might like."
              errorTitle="Could not load suggestions"
              errorDescription="Something went wrong. Try again."
              isAdded={isAdded}
              addingKeys={addingKeys}
              onAdd={handleAdd}
            />
          </div>
        )}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Results area: owns the loading / error / empty / grid switch for a tab.
// ---------------------------------------------------------------------------

interface ResultsAreaProps {
  loading: boolean;
  error: boolean;
  results: ResultEntry[] | null;
  onRetry: () => void;
  emptyIcon: LucideIcon;
  emptyTitle: string;
  emptyDescription: string;
  errorTitle: string;
  errorDescription: string;
  isAdded: (key: string) => boolean;
  addingKeys: Set<string>;
  onAdd: (entry: ResultEntry) => void;
}

function ResultsArea({
  loading,
  error,
  results,
  onRetry,
  emptyIcon,
  emptyTitle,
  emptyDescription,
  errorTitle,
  errorDescription,
  isAdded,
  addingKeys,
  onAdd,
}: ResultsAreaProps) {
  return (
    <div className="min-h-[280px] max-h-[52vh] overflow-y-auto">
      {loading ? (
        <div className={GRID_CLASS} aria-busy="true">
          <span className="sr-only">Loading titles</span>
          {Array.from({ length: 10 }).map((_, i) => (
            <PosterCardSkeleton key={i} />
          ))}
        </div>
      ) : error ? (
        <ErrorState
          title={errorTitle}
          description={errorDescription}
          className="min-h-[280px]"
          action={
            <Button type="button" variant="outline" onClick={onRetry}>
              Try again
            </Button>
          }
        />
      ) : results && results.length > 0 ? (
        <ul className={GRID_CLASS}>
          {results.map((entry) => {
            const key = `${entry.mediaType}:${entry.id}`;
            return (
              <ResultCard
                key={key}
                entry={entry}
                added={isAdded(key)}
                adding={addingKeys.has(key)}
                onAdd={() => onAdd(entry)}
              />
            );
          })}
        </ul>
      ) : (
        <EmptyState
          icon={emptyIcon}
          title={emptyTitle}
          description={emptyDescription}
          className="min-h-[280px]"
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// A single poster result with an Add / Added button.
// ---------------------------------------------------------------------------

interface ResultCardProps {
  entry: ResultEntry;
  added: boolean;
  adding: boolean;
  onAdd: () => void;
}

function ResultCard({ entry, added, adding, onAdd }: ResultCardProps) {
  const imageUrl = buildImageUrl(entry.posterPath, 'w342');

  return (
    <li className="flex flex-col gap-2">
      <div className="relative aspect-2/3 w-full overflow-hidden rounded-lg bg-card shadow-elevation-card">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={entry.title}
            fill
            className="object-cover"
            sizes="(max-width: 640px) 33vw, 160px"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-secondary/30">
            <span className="text-muted-foreground text-[10px] uppercase tracking-widest font-bold">
              No Image
            </span>
          </div>
        )}
        <span className="absolute top-1.5 left-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white">
          {entry.mediaType === 'movie' ? 'Movie' : 'TV'}
        </span>
      </div>

      <div className="flex flex-col min-w-0">
        <span className="text-sm font-medium truncate" title={entry.title}>
          {entry.title}
        </span>
        {entry.year && (
          <span className="text-xs text-muted-foreground">{entry.year}</span>
        )}
      </div>

      <Button
        type="button"
        size="sm"
        variant={added ? 'outline' : 'default'}
        disabled={added || adding}
        onClick={onAdd}
        className={cn('w-full gap-1.5', added && 'text-muted-foreground')}
        aria-label={
          added ? `${entry.title} already added` : `Add ${entry.title}`
        }
      >
        {added ? (
          <>
            <Check className="w-3.5 h-3.5" />
            Added
          </>
        ) : adding ? (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Adding…
          </>
        ) : (
          <>
            <Plus className="w-3.5 h-3.5" />
            Add
          </>
        )}
      </Button>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Tab pill button.
// ---------------------------------------------------------------------------

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  id: string;
  controls: string;
  children: React.ReactNode;
}

function TabButton({ active, onClick, id, controls, children }: TabButtonProps) {
  return (
    <button
      type="button"
      role="tab"
      id={id}
      aria-controls={controls}
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active
          ? 'bg-foreground text-background'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}
