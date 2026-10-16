"use client";

import { Search, Loader2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useDebounce } from "@/hooks/useDebounce";
import type { SearchResponse } from "@/types/tmdb";
import { useUIStore } from "@/client/stores/ui";
import { trackSearch } from "@/client/searchEvents";
import {
  buildSuggestions,
  optionId,
  SuggestionList,
  SUGGESTIONS_ID,
  type Suggestion,
} from "./SearchSuggestions";

interface SearchFieldProps {
  className?: string;
  /** True while a search request is in flight — renders an inline spinner. */
  fetching?: boolean;
  /**
   * Typeahead suggestions fed by the page's own results (no extra
   * requests). Omit to render the plain field.
   */
  suggestionsData?: SearchResponse | null;
}

export function SearchField({ className, fetching = false, suggestionsData }: SearchFieldProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);

  const [query, setQuery] = useState(searchParams.get("q") || "");
  const debouncedQuery = useDebounce(query, 350);

  // Re-sync local input when the URL query changes from the outside
  // (back/forward navigation, filter changes, etc.).
  const [prevParams, setPrevParams] = useState(searchParams);
  if (searchParams !== prevParams) {
    setPrevParams(searchParams);
    setQuery(searchParams.get("q") || "");
  }

  // Always read the freshest params inside the debounce effect without
  // re-subscribing it to param changes — this keeps the effect firing only
  // when the *typed* value settles, so a back/forward nav can't be undone by
  // a stale debounced value. Synced in an effect (not during render) so it's
  // safe under the React Compiler.
  const searchParamsRef = useRef(searchParams);
  useEffect(() => {
    searchParamsRef.current = searchParams;
  }, [searchParams]);

  const commitQuery = (nextQuery: string, method: "push" | "replace") => {
    const params = searchParamsRef.current;
    const currentQuery = params.get("q") || "";
    // No-op guard: never fire a duplicate request for an unchanged query.
    if (nextQuery === currentQuery) return;

    const next = new URLSearchParams(params);
    if (nextQuery) {
      next.set("q", nextQuery);
    } else {
      next.delete("q");
    }
    // Reset pagination on a new search.
    next.delete("page");
    const qs = next.toString();
    const url = qs ? `${pathname}?${qs}` : pathname;
    if (method === "push") {
      router.push(url);
    } else {
      router.replace(url);
    }
  };

  // Debounced-while-typing: update the URL with replace() so we don't spam
  // browser history. Depends only on the debounced value (router/pathname are
  // stable) so URL-driven syncs never trigger a spurious navigation.
  useEffect(() => {
    commitQuery(debouncedQuery, "replace");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery]);

  // "/" focuses search from anywhere on the page (unless already typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ---- Typeahead (combobox) ------------------------------------------------
  // Suggestions come from the page's results, only while they belong to the
  // text in the box (the URL's q catches up after the debounce).
  const openQuickView = useUIStore((s) => s.openQuickView);
  const suggestionsEnabled = suggestionsData !== undefined;
  const fresh = (searchParams.get("q") || "") === query.trim();
  const suggestions = suggestionsEnabled && fresh ? buildSuggestions(suggestionsData) : [];
  const [activeIndex, setActiveIndex] = useState(-1);
  const [dismissed, setDismissed] = useState(false);
  const listOpen =
    suggestionsEnabled && focused && !dismissed && query.trim().length > 0 && suggestions.length > 0;

  const pick = (s: Suggestion) => {
    trackSearch("result_opened", query, {
      section: "suggestion",
      mediaType: s.mediaType,
      id: s.id,
      position: suggestions.indexOf(s) + 1,
    });
    openQuickView(s.mediaType, String(s.id));
    setDismissed(true);
  };
  const seeAll = () => {
    commitQuery(query, "push");
    setDismissed(true);
  };

  const clear = () => {
    setQuery("");
    setActiveIndex(-1);
    commitQuery("", "push");
    inputRef.current?.focus();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // An active suggestion wins Enter; otherwise search immediately and
    // record a history entry.
    if (listOpen && activeIndex >= 0) {
      if (activeIndex < suggestions.length) pick(suggestions[activeIndex]);
      else seeAll();
      return;
    }
    commitQuery(query, "push");
    setDismissed(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (listOpen && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      // Options are the suggestions plus the trailing "See all" row.
      const count = suggestions.length + 1;
      setActiveIndex((i) =>
        e.key === "ArrowDown" ? (i + 1) % count : (i - 1 + count) % count,
      );
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      // First Esc closes suggestions, next clears, next leaves the field.
      if (listOpen) setDismissed(true);
      else if (query) clear();
      else inputRef.current?.blur();
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={cn("relative w-full", className)}
      role="search"
      aria-busy={fetching}
    >
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      <Input
        ref={inputRef}
        type="search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActiveIndex(-1);
          setDismissed(false);
        }}
        onKeyDown={handleKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder="Search movies, TV, people or themes…"
        aria-label="Search movies, TV shows, people and themes"
        autoComplete="off"
        {...(suggestionsEnabled && {
          role: "combobox",
          "aria-expanded": listOpen,
          "aria-controls": SUGGESTIONS_ID,
          "aria-autocomplete": "list" as const,
          "aria-activedescendant":
            listOpen && activeIndex >= 0 ? optionId(activeIndex) : undefined,
        })}
        // pr-16 leaves room for the spinner + clear button; the native
        // search-cancel glyph is hidden in favour of our own.
        className="pl-9 pr-16 bg-muted/50 border-muted-foreground/20 focus-visible:ring-offset-0 [&::-webkit-search-cancel-button]:appearance-none"
      />
      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
        {fetching && (
          <Loader2
            className="h-4 w-4 text-muted-foreground animate-spin"
            aria-hidden="true"
          />
        )}
        {query && (
          <button
            type="button"
            onClick={clear}
            aria-label="Clear search"
            title="Clear (Esc)"
            className="inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-foreground/10 hover:text-foreground transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {listOpen && (
        <SuggestionList
          items={suggestions}
          query={query}
          activeIndex={activeIndex}
          onPick={pick}
          onSeeAll={seeAll}
        />
      )}
    </form>
  );
}
