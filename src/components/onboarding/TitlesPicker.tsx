'use client';

import { useState, useEffect, useTransition } from 'react';
import Image from 'next/image';
import { Check, ArrowRight, Search, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/useToast';
import { cn } from '@/lib/cn';
import {
  submitOnboardingTitlesAction,
  searchOnboardingTitlesAction,
} from '@/actions/onboarding';
import type { OnboardingTitle } from '@/services/onboarding/titles';

interface TitlesPickerProps {
  /** Server-rendered popular grid shown when the search field is empty. */
  titles: OnboardingTitle[];
}

type SelectionKey = `${'movie' | 'tv'}:${string}`;

const MIN_SELECTIONS = 0; // Skip allowed — 0 is valid.
const MAX_SELECTIONS = 20;
const SEARCH_DEBOUNCE_MS = 250;

function keyOf(t: OnboardingTitle): SelectionKey {
  return `${t.mediaType}:${t.mediaId}`;
}

/**
 * Single poster card the user taps to select/deselect a title. Shared by
 * the persistent "Selected" strip and the results grid so both render
 * identically. Tapping always calls `onToggle` — in the Selected strip
 * that deselects; in the results grid it selects (or deselects).
 */
function TitleCard({
  title,
  selected,
  onToggle,
}: {
  title: OnboardingTitle;
  selected: boolean;
  onToggle: (t: OnboardingTitle) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onToggle(title)}
      className={cn(
        'group relative aspect-[2/3] rounded-md overflow-hidden border-2 transition-all cursor-pointer',
        selected
          ? 'border-primary scale-[0.97]'
          : 'border-transparent hover:border-foreground/30',
      )}
      aria-pressed={selected}
      aria-label={title.title}
    >
      {title.posterUrl ? (
        <Image
          src={title.posterUrl}
          alt=""
          fill
          className="object-cover"
          sizes="(max-width: 640px) 33vw, 120px"
        />
      ) : (
        <div className="absolute inset-0 bg-secondary flex items-center justify-center text-xs text-muted-foreground p-2 text-center">
          {title.title}
        </div>
      )}
      {/* Bottom gradient + title — visible on hover or when selected. */}
      <div
        className={cn(
          'absolute inset-x-0 bottom-0 px-1.5 pt-6 pb-1.5 text-[10px] leading-tight text-white text-left',
          'bg-gradient-to-t from-black/85 via-black/40 to-transparent transition-opacity',
          selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
        )}
      >
        <span className="line-clamp-2 font-medium">{title.title}</span>
        {title.releaseYear && (
          <span className="text-white/70"> ({title.releaseYear})</span>
        )}
      </div>
      {selected && (
        <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-primary text-white flex items-center justify-center shadow-md">
          <Check size={12} strokeWidth={3} />
        </span>
      )}
    </button>
  );
}

/**
 * Poster grid the user taps through to seed their initial taste.
 *
 * - Empty query → render `titles` (the server-rendered popular picks).
 * - Non-empty query → debounced TMDB search via server action; selection
 *   state persists across the swap so the user can search, pick, clear
 *   the query, and keep their pick.
 *
 * Selected titles are pinned to a persistent "Selected" strip at the very
 * top (above search), so a pick never disappears when the results grid
 * swaps to search results or refreshes. The results grid excludes anything
 * already selected, so each pick shows exactly once.
 *
 * Selection lives client-side until Finish; no per-tap network calls.
 * Skip is always available — onboarding's ~5min target wins over a
 * "must pick something" gate.
 */
export function TitlesPicker({ titles }: TitlesPickerProps) {
  const [selected, setSelected] = useState<Map<SelectionKey, OnboardingTitle>>(
    new Map(),
  );
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<OnboardingTitle[] | null>(
    null,
  );
  const [searching, setSearching] = useState(false);

  // Debounced TMDB search. Cleared query resets to the popular grid by
  // setting `searchResults` to null (rendered list short-circuits to
  // the prop). Stale-result race protection via a per-effect token.
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      // Both legitimate "reset to fallback" writes; the rule flags any
      // sync setState in an effect but here we need to clear search
      // state when the input empties out.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSearching(false);
       
      setSearchResults(null);
      return;
    }

    let cancelled = false;
    setSearching(true);
    const t = setTimeout(() => {
      searchOnboardingTitlesAction(trimmed)
        .then((rows) => {
          if (cancelled) return;
          setSearchResults(rows);
        })
        .catch(() => {
          if (cancelled) return;
          setSearchResults([]);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query]);

  const toggle = (t: OnboardingTitle) => {
    const k = keyOf(t);
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(k)) next.delete(k);
      else if (next.size < MAX_SELECTIONS) next.set(k, t);
      else {
        toast.error(
          'That’s plenty',
          `Pick up to ${MAX_SELECTIONS} to seed your recommendations.`,
        );
        return prev;
      }
      return next;
    });
  };

  const handleFinish = () => {
    const picks = Array.from(selected.keys()).map((k) => {
      const [mediaType, mediaId] = k.split(':') as ['movie' | 'tv', string];
      return { mediaType, mediaId };
    });
    startTransition(async () => {
      try {
        if (picks.length > 0) {
          await submitOnboardingTitlesAction(picks);
        }
        // Hard reload into /me so the sidebar / accent / cached layout
        // data all rehydrate with the just-applied onboarding state
        // (new favorites, region, theme cookie, etc.).
        window.location.assign('/me');
      } catch {
        toast.error('Could not save', 'Please try again or skip for now.');
      }
    });
  };

  const handleSkip = () => {
    startTransition(() => {
      window.location.assign('/me');
    });
  };

  const selectedTitles = Array.from(selected.values());
  // Exclude already-selected titles from the results grid so each pick
  // appears exactly once (pinned in the Selected strip above).
  const visibleTitles = (searchResults ?? titles).filter(
    (t) => !selected.has(keyOf(t)),
  );
  const showEmptyState =
    searchResults !== null && searchResults.length === 0 && !searching;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted-foreground">
        {selected.size === 0
          ? 'Pick a few favorites — the more we have, the better For You gets. You can always skip.'
          : `${selected.size} selected · up to ${MAX_SELECTIONS}`}
      </p>

      {selectedTitles.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-foreground">
            Selected ({selectedTitles.length})
          </p>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-[280px] overflow-y-auto -mr-2 pr-2 scrollbar-thin scrollbar-thumb-rounded scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent">
            {selectedTitles.map((t) => (
              <TitleCard key={keyOf(t)} title={t} selected onToggle={toggle} />
            ))}
          </div>
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search a movie or show…"
          className="pl-9 pr-9"
        />
        {searching && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin" />
        )}
      </div>

      {showEmptyState ? (
        <div className="grid place-items-center min-h-[200px] text-sm text-muted-foreground">
          No matches for &ldquo;{query}&rdquo;.
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-[420px] overflow-y-auto -mr-2 pr-2 scrollbar-thin scrollbar-thumb-rounded scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent">
          {visibleTitles.map((t) => (
            <TitleCard
              key={keyOf(t)}
              title={t}
              selected={selected.has(keyOf(t))}
              onToggle={toggle}
            />
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 pt-2">
        <Button
          variant="ghost"
          onClick={handleSkip}
          disabled={pending}
          className="text-muted-foreground hover:text-foreground"
        >
          Skip for now
        </Button>
        <Button
          onClick={handleFinish}
          disabled={pending || selected.size < MIN_SELECTIONS}
          className="gap-2"
        >
          {selected.size > 0 ? `Finish (${selected.size})` : 'Finish'}
          <ArrowRight size={16} />
        </Button>
      </div>
    </div>
  );
}
