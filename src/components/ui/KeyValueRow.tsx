import React from "react";
import { cn } from "@/lib/cn";

interface KeyValueRowProps {
  label: string;
  value: React.ReactNode;
  className?: string;
}

export function KeyValueRow({ label, value, className }: KeyValueRowProps) {
  return (
    <div className={cn("flex items-start justify-between py-3 border-b border-border/10 border-dashed last:border-0", className)}>
      <span className="text-muted-foreground font-medium text-sm w-1/3 shrink-0">{label}</span>
      <div className="text-right text-foreground font-medium w-2/3 break-words">
        {value}
      </div>
    </div>
  );
}
