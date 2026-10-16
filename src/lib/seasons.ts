import { formatRuntime } from '@/lib/format';

interface SeasonLike {
  seasonNumber: number;
  episodeCount: number | null;
}

/**
 * Approximate run time for `episodes` episodes of a typical length, e.g.
 * "~8h 20m". Exact per-episode runtimes would cost one TMDB call per season.
 */
export function estimateRuntime(episodes: number, episodeRuntime: number | null): string | null {
  if (!episodeRuntime || episodes <= 0) return null;
  const formatted = formatRuntime(episodes * episodeRuntime);
  return formatted ? `~${formatted}` : null;
}

/**
 * Series summary parts, e.g. ["14 seasons", "308 episodes", "~154h 0m total"].
 * Specials (season 0) are excluded from the counts. Parts with no data are
 * dropped; empty when there are no regular seasons.
 */
export function seriesSummaryParts(
  seasons: SeasonLike[],
  episodeRuntime: number | null,
): string[] {
  const regular = seasons.filter((s) => s.seasonNumber > 0);
  if (regular.length === 0) return [];

  const episodes = regular.reduce((sum, s) => sum + (s.episodeCount ?? 0), 0);
  const runtime = estimateRuntime(episodes, episodeRuntime);
  return [
    `${regular.length} ${regular.length === 1 ? 'season' : 'seasons'}`,
    episodes > 0 ? `${episodes} ${episodes === 1 ? 'episode' : 'episodes'}` : null,
    runtime ? `${runtime} total` : null,
  ].filter((p): p is string => p !== null);
}
