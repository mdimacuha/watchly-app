import Link from "next/link";
import Image from "next/image";
import { buildImageUrl } from "@/lib/tmdb";
import { cn } from "@/lib/cn";

interface TmdbCollectionCardProps {
  collection: {
    id: number;
    name: string;
    posterPath?: string | null;
    backdropPath?: string | null;
  };
}

export function TmdbCollectionCard({ collection }: TmdbCollectionCardProps) {
  const posterUrl = buildImageUrl(collection.posterPath, "w500");

  return (
    <Link
      href={`/collections/${collection.id}`}
      className="group relative flex flex-col overflow-hidden rounded-lg bg-card transition-all hover:scale-105 hover:shadow-lg hover:ring-2 hover:ring-primary/50"
    >
      <div className="relative aspect-2/3 w-full overflow-hidden bg-muted">
        {posterUrl ? (
          <Image
            src={posterUrl}
            alt={collection.name}
            fill
            className="object-cover transition-transform group-hover:scale-110"
            sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 20vw"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            No Image
          </div>
        )}
      </div>
      <div className="p-3">
        <h3 className="line-clamp-2 text-sm font-semibold leading-tight text-foreground group-hover:text-primary">
          {collection.name}
        </h3>
      </div>
    </Link>
  );
}
