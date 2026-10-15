import React from "react";
import { cn } from "@/lib/cn";

interface SpacingBarProps {
  label: string;
  value: string; // e.g. "4px"
  heightClass: string; // e.g. "h-1" for space-1
}

export function SpacingBar({ label, value, heightClass }: SpacingBarProps) {
  return (
    <div className="flex items-center gap-4">
      <div className="w-24 flex flex-col items-start">
        <span className="text-xs font-mono text-foreground">{label}</span>
        <span className="text-[10px] text-muted-foreground">{value}</span>
      </div>
      <div
        className={cn("w-full bg-primary/60 rounded-sm", heightClass)}
      ></div>
    </div>
  );
}
