import React from "react";
import { cn } from "@/lib/cn";

interface TypeRampRowProps {
  label: string;
  specs: string; // e.g. "32px / 700 / -0.02em"
  className: string; // The typography class to apply, e.g. "text-h1"
}

export function TypeRampRow({ label, specs, className }: TypeRampRowProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-baseline py-4 border-b border-border/40 last:border-0">
      <div className="md:col-span-3 flex flex-col gap-1">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="text-xs font-mono text-muted-foreground opacity-60">
          {specs}
        </span>
      </div>
      <div className="md:col-span-9">
        <span className={cn("text-foreground", className)}>
          The quick brown fox jumps
        </span>
      </div>
    </div>
  );
}
