import React from "react";
import { CastCard } from "./CastCard";
import { CastMember } from "@/services/tmdb/title";

interface TopCastRowProps {
  cast: CastMember[];
}

export function TopCastRow({ cast }: TopCastRowProps) {
  if (!cast || cast.length === 0) return null;

  return (
    <div className="flex flex-col gap-4 mt-8">
      <h3 className="text-lg font-semibold">Top Cast</h3>
      <div className="flex gap-4 overflow-x-auto pb-4 no-scrollbar">
        {cast.map((member) => (
          <CastCard key={member.id} cast={member} />
        ))}
      </div>
    </div>
  );
}
