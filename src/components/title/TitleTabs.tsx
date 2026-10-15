"use client";

import React from "react";
import { cn } from "@/lib/cn";

interface TitleTabsProps {
  tabs: { key: string; label: string }[];
  activeKey: string;
  onChange: (key: string) => void;
  className?: string;
}

export function TitleTabs({ tabs, activeKey, onChange, className }: TitleTabsProps) {
  return (
    <div className={cn("flex items-center gap-6 overflow-x-auto border-b border-border/10 pb-1 no-scrollbar", className)}>
      {tabs.map((tab) => {
        const isActive = activeKey === tab.key;
        return (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            className={cn(
              "text-sm font-bold uppercase tracking-wider pb-3 border-b-2 transition-colors whitespace-nowrap",
              isActive 
                ? "border-primary text-primary" 
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
