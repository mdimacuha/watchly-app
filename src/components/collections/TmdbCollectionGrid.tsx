import { TmdbCollectionCard } from "./TmdbCollectionCard";

interface TmdbCollectionGridProps {
  collections: Array<{
    id: number;
    name: string;
    posterPath?: string | null;
    backdropPath?: string | null;
  }>;
}

export function TmdbCollectionGrid({ collections }: TmdbCollectionGridProps) {
  if (!collections?.length) {
    return (
      <div className="flex min-h-[200px] w-full items-center justify-center rounded-lg border border-dashed p-8 text-muted-foreground">
        No collections found.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {collections.map((collection) => (
        <TmdbCollectionCard key={collection.id} collection={collection} />
      ))}
    </div>
  );
}
