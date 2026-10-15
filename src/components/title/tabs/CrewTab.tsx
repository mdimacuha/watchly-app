import React from "react";
import { CrewMember } from "@/services/tmdb/title";
import { DataListTable } from "@/components/ui/DataListTable";

interface CrewTabProps {
  crew: CrewMember[];
}

export function CrewTab({ crew }: CrewTabProps) {
  // Sort crew by department then name for better grouping
  const sortedCrew = [...crew].sort((a, b) => {
    if (a.department === b.department) {
      return a.name.localeCompare(b.name);
    }
    return a.department.localeCompare(b.department);
  });

  const columns = [
    { key: "name", header: "Name", className: "w-1/3 font-medium text-foreground" },
    { key: "job", header: "Role", className: "w-1/3 text-muted-foreground" },
    { key: "dept", header: "Department", className: "w-1/3 text-muted-foreground/60 text-xs uppercase" },
  ];

  const rows = sortedCrew.map((c) => ({
    name: c.name,
    job: c.job,
    dept: c.department,
  }));

  return (
    <DataListTable
      columns={columns}
      rows={rows}
      dense
      emptyState="No crew information available."
    />
  );
}
