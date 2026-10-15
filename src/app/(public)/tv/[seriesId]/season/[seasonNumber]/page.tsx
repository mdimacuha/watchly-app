import { getTvSeasonDetails } from "@/services/tmdb/tvSeason";
import Image from "next/image";
import Link from "next/link";
import { buildImageUrl } from "@/lib/tmdb";
import { notFound } from "next/navigation";
import { formatDate, formatRuntime } from "@/lib/format";
import { BackLink } from "@/components/nav/BackLink";

// Public, region-agnostic TMDB content → ISR. On-demand params cache per
// `revalidate` (same pattern as the title page). 24h — TMDB catalog metadata
// does not change hourly, and hourly rewrites cost ISR writes for no gain.
export const revalidate = 86400;
export async function generateStaticParams() {
  return [];
}

export default async function SeasonPage({
  params,
}: {
  params: Promise<{ seriesId: string; seasonNumber: string }>;
}) {
  const { seriesId, seasonNumber } = await params;
  let season;
  try {
    season = await getTvSeasonDetails(seriesId, seasonNumber);
  } catch (e) {
    notFound();
  }

  return (
    <div className="min-h-screen pb-20 container mx-auto px-4 py-8">
       <BackLink fallbackHref={`/title/tv/${seriesId}`} className="mb-6" />

       <div className="flex items-center gap-4 mb-6 text-sm text-muted-foreground">
         <Link href={`/title/tv/${seriesId}`} className="hover:text-primary">{season.seriesName}</Link>
         <span>/</span>
         <span className="text-foreground">Season {seasonNumber}</span>
       </div>

       <div className="flex flex-col md:flex-row gap-8 mb-12">
         <div className="relative w-48 aspect-[2/3] shrink-0 rounded-lg overflow-hidden bg-muted shadow-lg">
           {season.posterPath && (
             <Image
               src={buildImageUrl(season.posterPath, "w500") || ''}
               alt={season.name}
               fill
               className="object-cover"
             />
           )}
         </div>
         <div className="flex flex-col justify-center">
           <h1 className="text-3xl font-bold mb-2">{season.name}</h1>
           <div className="text-sm text-muted-foreground font-bold uppercase tracking-wider mb-4">
             {formatDate(season.airDate)} • {season.episodes.length} Episodes
           </div>
           <p className="text-muted-foreground max-w-2xl">{season.overview}</p>
         </div>
       </div>

       <div className="space-y-4">
         {season.episodes.map((ep) => (
           <Link
             key={ep.id}
             href={`/tv/${seriesId}/season/${seasonNumber}/episode/${ep.episodeNumber}`}
             className="flex gap-4 p-4 rounded-lg bg-card border border-border/50 hover:border-primary/50 transition-colors group"
           >
             <div className="relative w-32 aspect-video shrink-0 bg-muted rounded overflow-hidden">
               {ep.stillPath && (
                 <Image
                   src={buildImageUrl(ep.stillPath, "w300") || ''}
                   alt={ep.name}
                   fill
                   className="object-cover"
                 />
               )}
             </div>
             <div className="flex flex-col gap-1">
               <div className="flex items-center gap-2">
                 <span className="text-xs font-bold text-muted-foreground">EP {ep.episodeNumber}</span>
                 <h3 className="font-semibold group-hover:text-primary transition-colors">{ep.name}</h3>
               </div>
               <div className="text-xs text-muted-foreground">
                 {formatDate(ep.airDate)} • {formatRuntime(ep.runtime)} • ★ {ep.voteAverage.toFixed(1)}
               </div>
               <p className="text-sm text-muted-foreground/80 line-clamp-2 mt-1">{ep.overview}</p>
             </div>
           </Link>
         ))}
       </div>
    </div>
  );
}
