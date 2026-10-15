import { getTvEpisodeDetails } from "@/services/tmdb/tvEpisode";
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

export default async function EpisodePage({
  params,
}: {
  params: Promise<{ seriesId: string; seasonNumber: string; episodeNumber: string }>;
}) {
  const { seriesId, seasonNumber, episodeNumber } = await params;
  let episode;
  try {
    episode = await getTvEpisodeDetails(seriesId, seasonNumber, episodeNumber);
  } catch (e) {
    notFound();
  }

  return (
    <div className="min-h-screen pb-20 container mx-auto px-4 py-8">
      <BackLink
        fallbackHref={`/tv/${seriesId}/season/${seasonNumber}`}
        className="mb-6"
      />

      <div className="flex items-center gap-4 mb-6 text-sm text-muted-foreground">
        <Link href={`/title/tv/${seriesId}`} className="hover:text-primary">{episode.seriesName}</Link>
        <span>/</span>
        <Link href={`/tv/${seriesId}/season/${seasonNumber}`} className="hover:text-primary">Season {seasonNumber}</Link>
        <span>/</span>
        <span className="text-foreground">Episode {episodeNumber}</span>
      </div>

      <div className="relative w-full aspect-video max-h-[60vh] rounded-xl overflow-hidden shadow-2xl mb-8 bg-black">
        {episode.still_path && (
          <Image
            src={buildImageUrl(episode.still_path, "original") || ''}
            alt={episode.name}
            fill
            className="object-contain"
            priority
          />
        )}
      </div>

      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">{episode.name}</h1>
        <div className="flex items-center gap-4 text-sm text-muted-foreground font-bold uppercase tracking-wider mb-6">
          <span>{formatDate(episode.air_date)}</span>
          <span>{formatRuntime(episode.runtime)}</span>
          <span>★ {episode.vote_average.toFixed(1)}</span>
        </div>

        <p className="text-lg text-muted-foreground leading-relaxed mb-10">
          {episode.overview}
        </p>

        {episode.guest_stars.length > 0 && (
          <div className="mb-10">
            <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-4">Guest Stars</h3>
            <div className="flex flex-wrap gap-4">
              {episode.guest_stars.map((star) => (
                <div key={star.id} className="flex items-center gap-3 bg-card p-2 pr-4 rounded-full border border-white/5">
                  <div className="relative w-10 h-10 rounded-full overflow-hidden bg-muted">
                    {star.profile_path && (
                      <Image
                        src={buildImageUrl(star.profile_path, "w200") || ''}
                        alt={star.name}
                        fill
                        className="object-cover"
                      />
                    )}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold">{star.name}</span>
                    <span className="text-[10px] text-muted-foreground">{star.character}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
