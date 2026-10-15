import React from "react";
import Link from "next/link";
import { CastMember } from "@/services/tmdb/title";
import { buildImageUrl } from "@/lib/tmdb";
import Image from "next/image";
import { cn } from "@/lib/cn";

interface CastTabProps {
  cast: CastMember[];
}

export function CastTab({ cast }: CastTabProps) {
  if (!cast || cast.length === 0) {
    return <div className="text-muted-foreground py-8 text-center italic">No cast information available.</div>;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {cast.map((member) => (
        <Link 
          key={member.id} 
          href={`/artist/${member.id}`}
          className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors group"
        >
          <div className="relative w-12 h-12 rounded-full overflow-hidden shrink-0 bg-muted border border-white/10 ring-2 ring-transparent group-hover:ring-primary/50 transition-all">
            {member.profilePath ? (
              <Image
                src={buildImageUrl(member.profilePath, "w185")!}
                alt={member.name}
                fill
                className="object-cover"
                sizes="48px"
              />
            ) : (
              <div className="flex w-full h-full items-center justify-center text-[8px] uppercase text-muted-foreground font-bold">
                N/A
              </div>
            )}
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-semibold text-sm truncate group-hover:text-primary transition-colors">{member.name}</span>
            <span className="text-xs text-muted-foreground truncate">{member.character}</span>
          </div>
        </Link>
      ))}
    </div>
  );
}
