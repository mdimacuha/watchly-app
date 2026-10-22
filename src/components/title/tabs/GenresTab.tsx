import React from "react";
import Link from "next/link";
import { Genre } from "@/server/tmdb/types";

interface GenresTabProps {
  genres: Genre[];
  mediaType?: "movie" | "tv";
}

export function GenresTab({ genres, mediaType = "movie" }: GenresTabProps) {
  if (!genres || genres.length === 0) {
    return <div className="text-muted-foreground italic py-8 text-center">No genres listed.</div>;
  }

  return (
    <div className="flex flex-wrap gap-3">
      {genres.map((genre) => (
        <Link
          key={genre.id}
          href={`/discover?genre=${genre.id}&type=${mediaType}`}
          aria-label={`Search ${genre.name} ${mediaType === "tv" ? "shows" : "movies"}`}
          className="px-4 py-2 rounded-full bg-secondary/30 text-secondary-foreground border border-white/5 hover:bg-secondary/50 hover:text-foreground transition-colors text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {genre.name}
        </Link>
      ))}
    </div>
  );
}
