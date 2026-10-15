"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { buildImageUrl } from "@/lib/tmdb";
import { cn } from "@/lib/cn";
import { TitleTabs } from "./TitleTabs";
import { TvSeasonPayload } from "@/services/tmdb/tvSeason";
import { formatDate, formatRuntime } from "@/lib/format";
import { SkeletonBox } from "@/components/watchly/skeletons";

interface SeasonSummary {
  seasonNumber: number;
  name: string;
  episodeCount: number | null;
  posterPath: string | null;
  airDate: string | null;
  overview: string | null;
}

interface TvSeasonsEpisodesPanelProps {
  seriesId: number;
  seasons: SeasonSummary[];
}

export function TvSeasonsEpisodesPanel({ seriesId, seasons }: TvSeasonsEpisodesPanelProps) {
  const [activeTab, setActiveTab] = useState("SEASONS");
  const [selectedSeasonNumber, setSelectedSeasonNumber] = useState<number>(() => {
    // Default to season 1 or first available
    const hasSeason1 = seasons.find(s => s.seasonNumber === 1);
    if (hasSeason1) return 1;
    return seasons[0]?.seasonNumber || 1;
  });

  // Season Details Cache
  const [seasonDetailsCache, setSeasonDetailsCache] = useState<Record<number, TvSeasonPayload>>({});
  const [isLoading, setIsLoading] = useState(false);

  // Fetch season details when needed
  useEffect(() => {
    if (activeTab === "EPISODES" && !seasonDetailsCache[selectedSeasonNumber]) {
      const fetchSeason = async () => {
        setIsLoading(true);
        try {
          const res = await fetch(`/api/v1/tv/${seriesId}/season/${selectedSeasonNumber}`);
          const json = await res.json();
          if (json.ok) {
            setSeasonDetailsCache(prev => ({ ...prev, [selectedSeasonNumber]: json.data }));
          }
        } catch (err) {
          console.error("Failed to fetch season", err);
        } finally {
          setIsLoading(false);
        }
      };
      fetchSeason();
    }
  }, [activeTab, selectedSeasonNumber, seriesId, seasonDetailsCache]);

  const activeSeasonDetails = seasonDetailsCache[selectedSeasonNumber];

  return (
    <div className="mt-12 w-full max-w-4xl">
      <TitleTabs
        tabs={[
          { key: "SEASONS", label: "Seasons" },
          { key: "EPISODES", label: "Episodes" },
        ]}
        activeKey={activeTab}
        onChange={setActiveTab}
        className="mb-6"
      />

      {activeTab === "SEASONS" && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {seasons.map((season) => (
            <Link
              key={season.seasonNumber}
              href={`/tv/${seriesId}/season/${season.seasonNumber}`}
              className="group flex flex-col gap-2 p-2 rounded-lg hover:bg-muted/10 transition-colors"
            >
              <div className="relative aspect-2/3 w-full overflow-hidden rounded-md bg-muted shadow-sm border border-white/5">
                {season.posterPath ? (
                  <Image
                    src={buildImageUrl(season.posterPath, "w300") || ''}
                    alt={season.name}
                    fill
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 200px"
                    className="object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-secondary text-xs text-muted-foreground">
                    NO POSTER
                  </div>
                )}
              </div>
              <div>
                <h4 className="font-semibold text-sm group-hover:text-primary transition-colors">
                  {season.name}
                </h4>
                <p className="text-xs text-muted-foreground">
                  {season.episodeCount} Episodes
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}

      {activeTab === "EPISODES" && (
        <div className="flex flex-col gap-6">
          {/* Season Selector (Horizontal Scroll) */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar">
            {seasons.map((season) => (
              <button
                key={season.seasonNumber}
                onClick={() => setSelectedSeasonNumber(season.seasonNumber)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider border transition-colors whitespace-nowrap",
                  selectedSeasonNumber === season.seasonNumber
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-transparent border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                )}
              >
                {season.name}
              </button>
            ))}
          </div>

          {/* Episodes List */}
          <div className="flex flex-col border rounded-lg border-border/50 divide-y divide-border/10 bg-card/50">
            {isLoading && !activeSeasonDetails ? (
              <div aria-hidden className="flex flex-col divide-y divide-border/10">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex gap-4 p-4 items-start">
                    <SkeletonBox className="hidden sm:block w-32 aspect-video shrink-0 rounded" />
                    <div className="flex flex-col flex-1 min-w-0 gap-2 pt-0.5">
                      <SkeletonBox className="h-4 w-2/3" />
                      <SkeletonBox className="h-3 w-1/3" />
                      <SkeletonBox className="h-3 w-full mt-1" />
                    </div>
                  </div>
                ))}
              </div>
            ) : activeSeasonDetails ? (
               activeSeasonDetails.episodes && activeSeasonDetails.episodes.length > 0 ? (
                activeSeasonDetails.episodes.map((ep) => (
                  <Link
                    key={ep.id}
                    href={`/tv/${seriesId}/season/${selectedSeasonNumber}/episode/${ep.episodeNumber}`}
                    className="flex gap-4 p-4 hover:bg-muted/5 transition-colors group items-start"
                  >
                    <div className="hidden sm:block relative w-32 aspect-video shrink-0 bg-muted rounded overflow-hidden border border-white/5">
                      {ep.stillPath ? (
                        <Image
                          src={buildImageUrl(ep.stillPath, "w300") || ''}
                          alt={ep.name}
                          fill
                          sizes="128px"
                          className="object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-[9px] text-muted-foreground">
                          NO IMG
                        </div>
                      )}
                    </div>
                    
                    <div className="flex flex-col flex-1 min-w-0 gap-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-muted-foreground w-6 shrink-0">
                          {ep.episodeNumber}
                        </span>
                        <h4 className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors truncate">
                          {ep.name}
                        </h4>
                      </div>
                      
                      <div className="flex items-center gap-3 text-[10px] text-muted-foreground pl-8">
                        {ep.airDate && <span>{formatDate(ep.airDate)}</span>}
                        {ep.runtime && <span>{formatRuntime(ep.runtime)}</span>}
                        {ep.voteAverage > 0 && (
                           <span className="px-1 py-0.5 bg-green-900/30 text-green-400 rounded">
                             {ep.voteAverage.toFixed(1)}
                           </span>
                        )}
                      </div>
                      
                      <p className="text-xs text-muted-foreground/80 line-clamp-2 mt-1 pl-8">
                        {ep.overview}
                      </p>
                    </div>
                  </Link>
                ))
              ) : (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  No episodes found.
                </div>
              )
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
