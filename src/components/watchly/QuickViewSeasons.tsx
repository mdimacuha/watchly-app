'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { buildImageUrl } from '@/lib/tmdb';
import { estimateRuntime, seriesSummaryParts } from '@/lib/seasons';
import type { TitlePagePayload } from '@/services/tmdb/title';
import { ViewAllDivider } from './ViewAllDivider';

/** Seasons shown before "View all". */
const COLLAPSED_COUNT = 3;

interface QuickViewSeasonsProps {
  tvSeasons: NonNullable<TitlePagePayload['tvSeasons']>;
  /** Typical episode length (TMDB episode_run_time); null when unknown. */
  episodeRuntime: number | null;
  onNavigate: () => void;
}

/**
 * TV seasons for the Quick View popup: a series total, then one row per
 * season with episode count and approximate run time. Run times are
 * estimates (episodes × typical episode length) — exact per-episode
 * runtimes would cost one TMDB call per season. Specials are listed last and
 * left out of the totals.
 */
export function QuickViewSeasons({ tvSeasons, episodeRuntime, onNavigate }: QuickViewSeasonsProps) {
  const [expanded, setExpanded] = useState(false);
  const regular = tvSeasons.seasons.filter((s) => s.seasonNumber > 0);
  const specials = tvSeasons.seasons.filter((s) => s.seasonNumber === 0);
  const seasons = [...regular, ...specials];
  if (seasons.length === 0) return null;

  const summary = seriesSummaryParts(tvSeasons.seasons, episodeRuntime);

  return (
    <div className="rounded-lg bg-muted/10 border border-border/40 px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 mb-2">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
          Seasons
        </h3>
        <span className="text-xs text-muted-foreground">{summary.join(' · ')}</span>
      </div>

      {/* No inner scroll: the popup itself scrolls (fixed max height). */}
      <ol className="flex flex-col -mx-2">
        {(expanded ? seasons : seasons.slice(0, COLLAPSED_COUNT)).map((season) => {
          const poster = buildImageUrl(season.posterPath, 'w92');
          const runtime = estimateRuntime(season.episodeCount ?? 0, episodeRuntime);
          const meta = [
            season.airDate?.slice(0, 4),
            season.episodeCount != null &&
              `${season.episodeCount} ${season.episodeCount === 1 ? 'episode' : 'episodes'}`,
            runtime,
          ].filter(Boolean);

          return (
            <li key={season.seasonNumber}>
              <Link
                href={`/tv/${tvSeasons.seriesId}/season/${season.seasonNumber}`}
                onClick={onNavigate}
                className="group flex items-center gap-3 rounded-md py-2 px-2 hover:bg-foreground/5 transition-colors"
              >
                <div className="relative h-14 w-10 shrink-0 overflow-hidden rounded bg-muted">
                  {poster && (
                    <Image src={poster} alt="" fill className="object-cover" sizes="40px" />
                  )}
                </div>
                <div className="min-w-0 flex flex-col">
                  <span className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                    {season.name}
                  </span>
                  {meta.length > 0 && (
                    <span className="text-xs text-muted-foreground">{meta.join(' · ')}</span>
                  )}
                </div>
              </Link>
            </li>
          );
        })}
      </ol>

      {/* Expands in place — no trip to the title page just to see more. */}
      {seasons.length > COLLAPSED_COUNT && (
        <ViewAllDivider
          expanded={expanded}
          total={seasons.length}
          onToggle={() => setExpanded((v) => !v)}
          className="mt-1"
        />
      )}
    </div>
  );
}
