import React from "react";
import { cn } from "@/lib/cn";

interface DataListTableProps {
  columns: { key: string; header: string; className?: string }[];
  rows: Record<string, React.ReactNode>[];
  emptyState?: React.ReactNode;
  dense?: boolean;
}

export function DataListTable({ columns, rows, emptyState, dense }: DataListTableProps) {
  if (!rows || rows.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground border border-dashed border-border/20 rounded-lg">
        {emptyState || "No data available"}
      </div>
    );
  }

  return (
    <div className="w-full overflow-hidden rounded-md border border-border/10 bg-muted/5">
      {/* Header */}
      <div className="flex items-center bg-muted/20 border-b border-border/10 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        {columns.map((col) => (
          <div key={col.key} className={cn("px-4 py-3", col.className)}>
            {col.header}
          </div>
        ))}
      </div>
      
      {/* Rows */}
      <div className="flex flex-col">
        {rows.map((row, i) => (
          <div 
            key={i} 
            className={cn(
              "flex items-center border-b border-border/5 last:border-0 hover:bg-white/5 transition-colors",
              dense ? "text-sm" : "text-base"
            )}
          >
            {columns.map((col) => (
              <div key={col.key} className={cn("px-4 py-3", col.className)}>
                {row[col.key]}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
