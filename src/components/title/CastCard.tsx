import React from "react";
import Link from "next/link";
import Image from "next/image";
import { buildImageUrl } from "@/lib/tmdb";
import { cn } from "@/lib/cn";
import { CastMember } from "@/services/tmdb/title";

interface CastCardProps {
  cast: CastMember;
  className?: string;
}

export function CastCard({ cast, className }: CastCardProps) {
  const profileUrl = buildImageUrl(cast.profilePath, "w185");

  return (
    <Link 
      href={`/artist/${cast.id}`}
      className={cn("flex flex-col w-[120px] shrink-0 gap-2 group", className)}
    >
      <div className="relative aspect-2/3 w-full overflow-hidden rounded-md bg-muted transition-all">
        {profileUrl ? (
          <Image
            src={profileUrl}
            alt={cast.name}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            sizes="120px"
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-muted text-muted-foreground text-xs text-center p-1">
            No Image
          </div>
        )}
        
        {/* Overlay Border to avoid clipping issues with ring */}
        <div className="absolute inset-0 rounded-md border-2 border-transparent group-hover:border-primary/80 z-10 pointer-events-none transition-colors duration-200" />
      </div>
      <div className="flex flex-col">
        <span className="text-sm font-semibold truncate group-hover:text-primary transition-colors" title={cast.name}>
          {cast.name}
        </span>
        <span className="text-xs text-muted-foreground truncate" title={cast.character || ""}>
          {cast.character}
        </span>
      </div>
    </Link>
  );
}
