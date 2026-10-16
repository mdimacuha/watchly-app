"use client";

import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { useSearchParams, useRouter, usePathname } from "next/navigation";

export type FilterType = "all" | "movie" | "tv";

interface FilterPillsProps {
  className?: string;
}

export function FilterPills({ className }: FilterPillsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentType = (searchParams.get("type") as FilterType) || "all";

  const handleTypeChange = (type: FilterType) => {
    const params = new URLSearchParams(searchParams);
    if (type === "all") {
      params.delete("type");
    } else {
      params.set("type", type);
    }
    // Reset page on filter change
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div className={cn("flex items-center space-x-2", className)}>
      <Pill
        label="All"
        active={currentType === "all"}
        onClick={() => handleTypeChange("all")}
      />
      <Pill
        label="Movies"
        active={currentType === "movie"}
        onClick={() => handleTypeChange("movie")}
      />
      <Pill
        label="TV Shows"
        active={currentType === "tv"}
        onClick={() => handleTypeChange("tv")}
      />
    </div>
  );
}

function Pill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      variant={active ? "default" : "secondary"}
      size="sm"
      onClick={onClick}
      // Expose which type is selected to assistive tech.
      aria-pressed={active}
      className={cn(
        "rounded-full px-4 h-8 text-xs font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground hover:bg-primary/90"
          : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
      )}
    >
      {label}
    </Button>
  );
}
