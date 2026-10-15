"use client";

import { Search, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useDebounce } from "@/hooks/useDebounce";

interface SearchFieldProps {
  className?: string;
  /** True while a search request is in flight — renders an inline spinner. */
  fetching?: boolean;
}

export function SearchField({ className, fetching = false }: SearchFieldProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Enter searches immediately and records a history entry.
    commitQuery(query, "push");
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
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
        value={query}
        onChange={handleChange}
        placeholder="Search movies & TV shows..."
        aria-label="Search movies and TV shows"
        className="pl-9 pr-9 bg-muted/50 border-muted-foreground/20 focus-visible:ring-offset-0"
      />
      {fetching && (
        <Loader2
          className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin"
          aria-label="Searching"
          role="status"
        />
      )}
    </form>
  );
}
