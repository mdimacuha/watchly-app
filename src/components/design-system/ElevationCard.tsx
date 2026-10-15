import React from "react";
import { cn } from "@/lib/cn";

interface ElevationCardProps {
  label: string;
  className: string; // utility classes for bg, shadow, etc.
}

export function ElevationCard({ label, className }: ElevationCardProps) {
  return (
    <div
      className={cn(
        "flex h-40 w-full items-center justify-center rounded-lg border border-border/50 text-sm text-foreground transition-all",
        className
      )}
    >
      {label}
    </div>
  );
}
