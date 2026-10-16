"use client";

import { cn } from "@/lib/cn";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SearchService } from "@/services/search";
import { LEGACY_SERVICE_SLUGS, serviceName, useSearchServices } from "./useSearchServices";
import { useSearchParams, useRouter, usePathname } from "next/navigation";

interface FilterDropdownsProps {
  className?: string;
}

// Exported so consumers (e.g. ActiveFilterChips) can resolve a filter id back
// to its display name without duplicating the list. Ids are TMDB genre ids.
export const SEARCH_GENRES: { id: string; name: string }[] = [
  { id: "28", name: "Action" },
  { id: "12", name: "Adventure" },
  { id: "16", name: "Animation" },
  { id: "35", name: "Comedy" },
  { id: "80", name: "Crime" },
  { id: "99", name: "Documentary" },
  { id: "18", name: "Drama" },
  { id: "10751", name: "Family" },
  { id: "14", name: "Fantasy" },
  { id: "36", name: "History" },
  { id: "27", name: "Horror" },
  { id: "10402", name: "Music" },
  { id: "9648", name: "Mystery" },
  { id: "10749", name: "Romance" },
  { id: "878", name: "Science Fiction" },
  { id: "10770", name: "TV Movie" },
  { id: "53", name: "Thriller" },
  { id: "10752", name: "War" },
  { id: "37", name: "Western" },
];

const EARLIEST_YEAR = 1900;

export function FilterDropdowns({ className }: FilterDropdownsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentGenre = searchParams.get("genre") || "all";
  const currentService = searchParams.get("service") || "all";
  const currentYear = searchParams.get("year") || "all";

  const updateParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams);
    if (value === "all") {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  };

  const genres = SEARCH_GENRES;
  const services = useSearchServices();

  // Next year (announced releases) back to 1900 — the old fixed 50-year
  // list stopped at the late 1970s.
  const latestYear = new Date().getFullYear() + 1;
  const years = Array.from({ length: latestYear - EARLIEST_YEAR + 1 }, (_, i) =>
    (latestYear - i).toString()
  );

  return (
    <div className={cn("flex flex-wrap gap-2 items-center", className)}>
      <FilterSelect
        value={currentGenre}
        placeholder="Genre"
        label="Genre"
        items={genres}
        onValueChange={(val) => updateParam("genre", val)}
      />
      <ServiceSelect
        value={currentService}
        services={services}
        onValueChange={(val) => updateParam("service", val)}
      />
      <FilterSelect
        value={currentYear}
        placeholder="Year"
        label="Year"
        items={years.map((y) => ({ id: y, name: y }))}
        onValueChange={(val) => updateParam("year", val)}
      />
    </div>
  );
}

function FilterSelect({
  value,
  placeholder,
  label,
  items,
  onValueChange,
}: {
  value: string;
  placeholder: string;
  label: string;
  items: { id: string; name: string }[];
  onValueChange: (val: string) => void;
}) {
  const selectedLabel = value === "all" 
    ? `All ${label}s` 
    : items.find((i) => i.id === value)?.name || value;

  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className="w-[140px] h-9 bg-card border-border/50 text-sm hover:bg-foreground/5 focus:ring-0 focus:ring-offset-0 text-muted-foreground data-[state=open]:text-foreground data-[state=open]:border-border/50 transition-all rounded-lg">
        <SelectValue placeholder={placeholder}>{selectedLabel}</SelectValue>
      </SelectTrigger>
      <SelectContent className="bg-card border-border/50 rounded-lg shadow-lg">
        <SelectItem value="all" className="focus:bg-foreground/5 focus:text-foreground text-muted-foreground cursor-pointer rounded-md">All {label}s</SelectItem>
        {items.map((item) => (
          <SelectItem key={item.id} value={item.id} className="focus:bg-foreground/5 focus:text-foreground text-muted-foreground cursor-pointer rounded-md">
            {item.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const ITEM_CLASS =
  "focus:bg-foreground/5 focus:text-foreground text-muted-foreground cursor-pointer rounded-md";

/**
 * Streaming-service filter: the popular services pinned in a "Popular"
 * group, then every other service available in the region.
 */
function ServiceSelect({
  value,
  services,
  onValueChange,
}: {
  value: string;
  services: SearchService[];
  onValueChange: (val: string) => void;
}) {
  // Old links use slugs ("netflix") — show them as the matching provider.
  const normalized =
    value in LEGACY_SERVICE_SLUGS ? String(LEGACY_SERVICE_SLUGS[value]) : value;
  const featured = services.filter((s) => s.featured);
  const others = services.filter((s) => !s.featured);
  const selectedLabel = value === "all" ? "All Services" : serviceName(services, value);

  return (
    <Select value={normalized} onValueChange={onValueChange}>
      <SelectTrigger className="w-[140px] h-9 bg-card border-border/50 text-sm hover:bg-foreground/5 focus:ring-0 focus:ring-offset-0 text-muted-foreground data-[state=open]:text-foreground data-[state=open]:border-border/50 transition-all rounded-lg">
        <SelectValue placeholder="Service">
          <span className="truncate">{selectedLabel}</span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="bg-card border-border/50 rounded-lg shadow-lg">
        <SelectItem value="all" className={ITEM_CLASS}>All Services</SelectItem>
        {featured.length > 0 && (
          <SelectGroup>
            <SelectLabel className="text-xs uppercase tracking-widest text-muted-foreground/70">
              Popular
            </SelectLabel>
            {featured.map((s) => (
              <SelectItem key={s.id} value={String(s.id)} className={ITEM_CLASS}>
                {s.name}
              </SelectItem>
            ))}
          </SelectGroup>
        )}
        {others.length > 0 && (
          <>
            <SelectSeparator />
            <SelectGroup>
              <SelectLabel className="text-xs uppercase tracking-widest text-muted-foreground/70">
                All services
              </SelectLabel>
              {others.map((s) => (
                <SelectItem key={s.id} value={String(s.id)} className={ITEM_CLASS}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectGroup>
          </>
        )}
      </SelectContent>
    </Select>
  );
}
