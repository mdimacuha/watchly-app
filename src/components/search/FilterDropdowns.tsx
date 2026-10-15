"use client";

import { cn } from "@/lib/cn";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

export const SEARCH_SERVICES: { id: string; name: string }[] = [
  { id: "netflix", name: "Netflix" },
  { id: "prime", name: "Amazon Prime" },
  { id: "disney", name: "Disney+" },
  { id: "hulu", name: "Hulu" },
  { id: "max", name: "HBO Max" },
  { id: "apple", name: "Apple TV+" },
];

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
  const services = SEARCH_SERVICES;

  const years = Array.from({ length: 50 }, (_, i) =>
    (new Date().getFullYear() - i).toString()
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
      <FilterSelect
        value={currentService}
        placeholder="Service"
        label="Service"
        items={services}
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
