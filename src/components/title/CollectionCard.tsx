import React from "react";
import Link from "next/link";
import Image from "next/image";
import { buildImageUrl } from "@/lib/tmdb";
import { cn } from "@/lib/cn";

interface CollectionCardProps {
  collection: {
    id: number;
    name: string;
    posterPath: string | null;
    backdropPath: string | null;
  } | null;
  className?: string;
}

export function CollectionCard({ collection, className }: CollectionCardProps) {
  if (!collection) return null;

  const imageUrl = buildImageUrl(collection.posterPath, "w200");
  const backdropUrl = buildImageUrl(collection.backdropPath, "w500");

  return (
    <Link
      href={`/collection/${collection.id}`}
      className={cn(
        "group relative flex items-center gap-4 overflow-hidden rounded-lg bg-muted/20 border border-white/5 hover:border-white/20 hover:bg-muted/40 transition-all p-3 w-full max-w-md",
        className
      )}
    >
      {/* Background Image (faded) */}
      {backdropUrl && (
        <div className="absolute inset-0 opacity-10 group-hover:opacity-20 transition-opacity">
          <Image
            src={backdropUrl}
            alt=""
            fill
            sizes="(max-width: 768px) 100vw, 600px"
            className="object-cover blur-sm"
          />
        </div>
      )}

      {/* Poster */}
      <div className="relative h-16 w-12 shrink-0 overflow-hidden rounded-md bg-muted border border-white/10 shadow-sm z-10">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={collection.name}
            fill
            sizes="48px"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-secondary text-[8px] text-muted-foreground">
            NO IMG
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex flex-col z-10">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground group-hover:text-primary transition-colors">
          Part of the Collection
        </span>
        <h3 className="font-semibold text-sm leading-tight text-foreground group-hover:text-white transition-colors">
          {collection.name}
        </h3>
      </div>
    </Link>
  );
}
