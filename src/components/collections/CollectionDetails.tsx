import { getCollectionDetails } from "@/services/tmdb/collection";
import { buildImageUrl } from "@/lib/tmdb";
import Image from "next/image";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { PosterCard } from "@/components/watchly/PosterCard";
import { ExpandableText } from "@/components/ui/ExpandableText";
import { FavoriteButton } from '@/components/watchly/FavoriteButton';

export async function CollectionDetails({ id }: { id: string }) {
  const collection = await getCollectionDetails(id);
  console.log(collection);
  const backdropUrl = buildImageUrl(collection.backdropPath, "original");
  const posterUrl = buildImageUrl(collection.posterPath, "w500");

  return (
    <div className="animate-in fade-in space-y-8">
      {/* Hero Section */}
      <div className="relative overflow-hidden rounded-xl border border-white/10 bg-background/50 shadow-2xl">
        {/* Backdrop */}
        {backdropUrl && (
          <div className="absolute inset-0 opacity-20">
            <Image
              src={backdropUrl}
              alt=""
              fill
              className="object-cover blur-sm"
              priority
            />
            <div className="absolute inset-0 bg-linear-to-t from-background to-transparent" />
          </div>
        )}

        <div className="relative z-10 flex flex-col gap-8 p-6 md:flex-row md:p-10">
          {/* Poster */}
          <div className="shrink-0 mx-auto md:mx-0">
             <div className="relative aspect-2/3 w-48 overflow-hidden rounded-lg border border-white/10 shadow-lg md:w-64">
               {posterUrl ? (
                 <Image
                   src={posterUrl}
                   alt={collection.name}
                   fill
                   className="object-cover"
                   priority
                 />
               ) : (
                 <div className="flex h-full items-center justify-center bg-muted text-muted-foreground">
                   No Poster
                 </div>
               )}
             </div>
          </div>

          {/* Info */}
          <div className="flex flex-col justify-end gap-4 text-center md:text-left">
            <h1 className="text-3xl font-bold md:text-5xl">{collection.name}</h1>
            {collection.overview && (
              <ExpandableText
                text={collection.overview}
                className="max-w-3xl text-lg text-muted-foreground md:text-xl"
                maxHeight="max-h-[160px]"
                truncateLength={140}
              />
            )}
            <div className="flex flex-col md:flex-row items-center justify-center gap-2 md:justify-start">
                <Badge variant="outline" className="border-primary text-primary">
                    {collection.parts.length} Movies
                </Badge>
                <FavoriteButton 
                  id={collection.id} 
                  type="collection" 
                  className="w-full md:w-auto mt-2 md:mt-0" 
                />
            </div>
          </div>
        </div>
      </div>

      {/* Parts Grid */}
      <div className="space-y-4">
        <h2 className="text-2xl font-semibold">Movies in this Collection</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {collection.parts.map((part) => (
            <Link key={part.id} href={`/title/movie/${part.id}`}>
              <PosterCard
                title={part.title}
                year={part.releaseDate ? new Date(part.releaseDate).getFullYear().toString() : 'TBA'}
                genre="Movie"
                imageSrc={buildImageUrl(part.posterPath, "w500") || ''}
                className="w-full max-w-none"
                mediaType="movie"
                availability={part.providerBadges}
              />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
