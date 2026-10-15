import React from 'react';

export function PosterGridExample() {
  return (
    <div className="w-full rounded-xl border border-border bg-card/20 p-6 overflow-hidden">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Fluid Poster Grid
        </span>
        <span className="text-xs font-mono text-muted-foreground bg-secondary/50 px-2 py-1 rounded">
          repeat(auto-fill, minmax(180px, 1fr))
        </span>
      </div>

      {/* 
        This grid uses the minmax logic specified.
        On smaller screens (mobile), it might only show 1 or 2 columns.
        On tablet, it adapts to 3-4 columns.
        On desktop, 5-6 columns.
      */}
      <div
        className="grid gap-4 w-full"
        style={{
          gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
        }}
      >
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="aspect-2/3 w-full rounded-lg border border-primary/20 bg-primary/5 flex items-center justify-center relative group overflow-hidden"
          >
            <div className="absolute inset-0 bg-linear-to-b from-transparent to-black/60 opacity-60" />
            <span className="relative text-xs font-mono text-primary/70 group-hover:text-primary transition-colors">
              Poster {i + 1}
            </span>
            <div className="absolute inset-0 border-2 border-dashed border-primary/30 rounded-lg opacity-50" />
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        Resize the browser window to see the grid reflow automatically.
      </p>
    </div>
  );
}
