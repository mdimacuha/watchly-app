import React from "react";
import { cn } from "@/lib/cn";

interface RadiusCardProps {
  label: string;
  value: string; // e.g. "4px"
  radiusClass: string; // e.g. "rounded-sm"
}

export function RadiusCard({ label, value, radiusClass }: RadiusCardProps) {
  return (
    <div className="flex flex-col items-center gap-4">
      <div
        className={cn(
          "flex h-24 w-24 items-center justify-center border border-primary/30 bg-card/50 text-xs font-mono text-muted-foreground shadow-sm transition-all hover:border-primary",
          radiusClass
        )}
      >
        {label}
      </div>
      <div className="text-xs text-muted-foreground">
        <span className="font-mono text-foreground">{label}</span> ({value})
      </div>
    </div>
  );
}
