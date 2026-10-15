"use client";

import React, { useState } from "react";
import { cn } from "@/lib/cn";

interface ExpandableTextProps {
  text: string;
  className?: string;
  maxHeight?: string;
  truncateLength?: number;
}

export function ExpandableText({ 
  text, 
  className,
  maxHeight = "max-h-[300px]", 
  truncateLength = 300 
}: ExpandableTextProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const shouldTruncate = text.length > truncateLength;

  return (
    <div>
      <div 
        className={cn(
          "whitespace-pre-line",
          className,
          isExpanded 
            ? `${maxHeight} overflow-y-auto no-scrollbar pr-2` 
            : "line-clamp-4"
        )}
      >
        {text}
      </div>
      {shouldTruncate && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-primary text-sm font-medium mt-2 hover:underline focus:outline-hidden flex items-center gap-1"
        >
          {isExpanded ? "See less" : "See more..."}
        </button>
      )}
    </div>
  );
}
