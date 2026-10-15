"use client";

import React, { useState } from "react";
import { ReleaseRow } from "@/services/tmdb/title";
import { DataListTable } from "@/components/ui/DataListTable";
import { ArrowUpDown } from "lucide-react";

interface ReleasesTabProps {
  releases: ReleaseRow[];
}

export function ReleasesTab({ releases }: ReleasesTabProps) {
  const [sortDesc, setSortDesc] = useState(true);

  const sortedReleases = [...releases].sort((a, b) => {
    return sortDesc ? b.sortKey - a.sortKey : a.sortKey - b.sortKey;
  });

  const columns = [
    { key: "date", header: "Date", className: "w-[120px] font-mono text-xs text-muted-foreground shrink-0" },
    { key: "country", header: "Region", className: "w-[100px] font-bold text-foreground shrink-0" },
    { key: "cert", header: "Rating", className: "w-[80px] shrink-0" },
    { key: "label", header: "Note", className: "flex-1 text-muted-foreground italic text-xs truncate" },
  ];

  const rows = sortedReleases.map((r) => ({
    date: r.date,
    country: (
      <span className="flex items-center gap-2">
        <span className="uppercase bg-white/10 px-1 rounded text-[10px] tracking-wide font-mono text-muted-foreground min-w-[24px] text-center">
          {r.countryCode === "Global" ? "GL" : r.countryCode}
        </span>
      </span>
    ),
    cert: r.certification ? (
      <span className="border border-white/20 px-1.5 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider">
        {r.certification}
      </span>
    ) : <span className="text-muted-foreground/30">-</span>,
    label: r.label || "-",
  }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <button
          onClick={() => setSortDesc(!sortDesc)}
          className="flex items-center gap-2 text-xs font-bold uppercase text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowUpDown className="w-3 h-3" />
          Sort by Date {sortDesc ? "(Newest)" : "(Oldest)"}
        </button>
      </div>

      <DataListTable
        columns={columns}
        rows={rows}
        dense
        emptyState="No release information available."
      />
    </div>
  );
}
