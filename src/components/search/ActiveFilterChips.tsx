"use client";

import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { SEARCH_GENRES, SEARCH_SERVICES } from "./FilterDropdowns";

interface ActiveFilterChipsProps {
  className?: string;
}

// Structured filter params surfaced as removable chips. `q` (free text) is
// intentionally excluded — it's owned by SearchField and shown in the input.
const CLEARABLE_PARAMS = ["type", "genre", "year", "service"] as const;

const TYPE_LABELS: Record<string, string> = {
  movie: "Movies",
  tv: "TV Shows",
};

interface Chip {
  key: string;
  label: string;
  value: string;
}

export function ActiveFilterChips({ className }: ActiveFilterChipsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const type = searchParams.get("type");
  const genre = searchParams.get("genre");
  const service = searchParams.get("service");
  const year = searchParams.get("year");

  const chips: Chip[] = [];
  // `type=all` is the default (no filter), so it gets no chip.
  if (type && type !== "all") {
    chips.push({ key: "type", label: "Type", value: TYPE_LABELS[type] ?? type });
  }
  if (genre) {
    chips.push({
      key: "genre",
      label: "Genre",
      value: SEARCH_GENRES.find((g) => g.id === genre)?.name ?? genre,
    });
  }
  if (service) {
    chips.push({
      key: "service",
      label: "Service",
      value: SEARCH_SERVICES.find((s) => s.id === service)?.name ?? service,
    });
  }
  if (year) {
    chips.push({ key: "year", label: "Year", value: year });
  }

  if (chips.length === 0) return null;

  // Removing / clearing a filter resets pagination so results start at page 1.
  const removeParam = (key: string) => {
    const params = new URLSearchParams(searchParams);
    params.delete(key);
    params.delete("page");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  const clearAll = () => {
    const params = new URLSearchParams(searchParams);
    for (const key of CLEARABLE_PARAMS) params.delete(key);
    params.delete("page");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  return (
    <div
      role="group"
      aria-label="Active filters"
      className={cn("flex flex-wrap items-center gap-2", className)}
    >
      {chips.map((chip) => (
        <span
          key={chip.key}
          className="inline-flex items-center gap-1.5 rounded-full bg-secondary text-secondary-foreground h-8 pl-3 pr-1 text-xs font-medium"
        >
          <span className="text-muted-foreground">{chip.label}</span>
          <span>{chip.value}</span>
          <button
            type="button"
            onClick={() => removeParam(chip.key)}
            aria-label={`Remove ${chip.label} filter ${chip.value}`}
            className="ml-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-3 w-3" aria-hidden="true" />
          </button>
        </span>
      ))}

      <button
        type="button"
        onClick={clearAll}
        className="h-8 rounded px-1 text-xs font-medium text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Clear all
      </button>
    </div>
  );
}
