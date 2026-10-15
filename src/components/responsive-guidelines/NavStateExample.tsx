import React from "react";
import { cn } from "@/lib/cn";

export function NavStateExample() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
      {/* State A: Full Sidebar (Desktop) */}
      <div className="flex flex-col gap-3">
        <span className="text-xs font-mono text-muted-foreground uppercase">
          State A: Full Sidebar (Desktop &ge; 1280px)
        </span>
        <div className="h-64 w-full rounded-xl border border-border bg-background flex overflow-hidden relative">
          {/* Sidebar */}
          <div className="w-48 h-full border-r border-border bg-card/50 p-4 flex flex-col gap-3">
            <div className="h-4 w-20 bg-primary/20 rounded mb-4" />
            <div className="h-3 w-full bg-secondary rounded-sm" />
            <div className="h-3 w-3/4 bg-secondary rounded-sm" />
            <div className="h-3 w-5/6 bg-secondary rounded-sm" />
            <div className="mt-auto h-3 w-1/2 bg-secondary/50 rounded-sm" />
          </div>
          {/* Content */}
          <div className="flex-1 p-4 bg-background">
             <div className="h-32 w-full rounded border border-dashed border-border/50 flex items-center justify-center text-xs text-muted-foreground">
               Content Area
             </div>
          </div>
          {/* Label Overlay */}
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[1px] md:opacity-0 md:hover:opacity-100 transition-opacity pointer-events-none">
            <span className="bg-background/90 px-3 py-1 rounded border border-border text-xs">Desktop View</span>
          </div>
        </div>
      </div>

      {/* State B: Icon Rail (Tablet) */}
      <div className="flex flex-col gap-3">
        <span className="text-xs font-mono text-muted-foreground uppercase">
          State B: Icon Rail (Tablet 768px - 1279px)
        </span>
        <div className="h-64 w-full rounded-xl border border-border bg-background flex overflow-hidden relative">
          {/* Rail */}
          <div className="w-16 h-full border-r border-border bg-card/50 flex flex-col items-center py-4 gap-4">
            <div className="h-8 w-8 rounded bg-primary/20 mb-2" />
            <div className="h-6 w-6 rounded bg-secondary" />
            <div className="h-6 w-6 rounded bg-secondary" />
            <div className="h-6 w-6 rounded bg-secondary" />
          </div>
          {/* Content */}
          <div className="flex-1 p-4 bg-background">
             <div className="h-full w-full rounded border border-dashed border-border/50 flex items-center justify-center">
                <span className="text-xs text-muted-foreground text-center">
                  Content Expands<br/>(More Width)
                </span>
             </div>
          </div>
           {/* Label Overlay */}
           <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[1px] md:opacity-0 md:hover:opacity-100 transition-opacity pointer-events-none">
            <span className="bg-background/90 px-3 py-1 rounded border border-border text-xs">Tablet View</span>
          </div>
        </div>
      </div>
    </div>
  );
}
