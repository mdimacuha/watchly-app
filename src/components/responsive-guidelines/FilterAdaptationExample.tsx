import React from "react";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/badge";

export function FilterAdaptationExample() {
  const filters = ["Action", "Adventure", "Comedy", "Drama", "Sci-Fi", "Horror", "Thriller", "Romance", "Mystery", "Fantasy"];

  return (
    <div className="space-y-8">
      {/* Desktop Representation */}
      <div className="space-y-3">
        <span className="text-xs font-mono text-muted-foreground uppercase">
          Desktop: Sidebar or Sticky Top Bar
        </span>
        <div className="w-full rounded-lg border border-border bg-card/30 p-4">
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
             <span className="text-foreground font-medium">Filters:</span>
             <div className="flex gap-2">
                <Badge variant="secondary" className="rounded-md px-3 py-1">Genre: Sci-Fi</Badge>
                <Badge variant="secondary" className="rounded-md px-3 py-1">Year: 2024</Badge>
                <Badge variant="secondary" className="rounded-md px-3 py-1">Sort: Popular</Badge>
             </div>
          </div>
        </div>
      </div>

      {/* Tablet Representation */}
      <div className="space-y-3">
        <span className="text-xs font-mono text-muted-foreground uppercase">
          Tablet: Scrollable Strip or Action Sheet
        </span>
        <div className="w-full rounded-lg border border-border bg-card/30 p-4 overflow-hidden">
           <div className="flex items-center gap-3">
             <div className="shrink-0 h-8 w-8 rounded-md bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
                {/* Filter Icon placeholder */}
                <div className="w-4 h-4 border-2 border-white rounded-sm" />
             </div>
             
             {/* Scrollable Area */}
             <div className="flex-1 overflow-x-auto no-scrollbar flex items-center gap-2">
               {filters.map((filter) => (
                 <Badge 
                    key={filter} 
                    variant="outline" 
                    className="whitespace-nowrap rounded-pill border-border bg-background hover:bg-secondary cursor-pointer"
                 >
                   {filter}
                 </Badge>
               ))}
             </div>
           </div>
        </div>
        <p className="text-[10px] text-muted-foreground">
          * Horizontal scroll is enabled. Masking indicates more content.
        </p>
      </div>
    </div>
  );
}
