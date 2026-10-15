import React from "react";
import { cn } from "@/lib/cn";

interface ColorSwatchProps {
  label: string;
  variableName: string;
  hexValue?: string;
  colorClass: string; // e.g. "bg-background", "bg-primary"
  textColorClass?: string; // Optional override for text color inside swatch if needed
}

export function ColorSwatch({
  label,
  variableName,
  hexValue,
  colorClass,
}: ColorSwatchProps) {
  return (
    <div className="flex flex-col gap-3">
      <div
        className={cn(
          "h-24 w-full rounded-lg border border-border shadow-sm",
          colorClass
        )}
      />
      <div className="flex flex-col gap-1">
        <span className="text-sm font-semibold text-foreground">{label}</span>
        <span className="text-xs font-mono text-muted-foreground">
          {variableName}
        </span>
        {hexValue && (
          <span className="text-xs text-muted-foreground opacity-70">
            {hexValue}
          </span>
        )}
      </div>
    </div>
  );
}
