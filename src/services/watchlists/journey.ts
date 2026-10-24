import { isWatchedStatus, type WatchlistItemStatus } from './validators';

// Statuses that mark "the user has started watching". First entry into any
// of these sets started_at; staying within the set leaves it alone.
const WATCHING_STATUSES: ReadonlySet<WatchlistItemStatus> = new Set(['watching', 'rewatch']);

/**
 * The journey timestamps a status change implies (shared by single updates
 * and Tidy up, so both follow one rule):
 *   - started_at: set on first transition INTO watching/rewatch (if not
 *     already set). Never cleared, so "started X ago" stays stable.
 *   - finished_at: set on transition INTO a watched status (finished /
 *     rewatch), to `finishedAt` when the date is known (a Seen-it log), else
 *     now. Kept between watched statuses; cleared when leaving both.
 */
export function journeyPatch(
  current: { status: WatchlistItemStatus; startedAt: Date | null },
  next: WatchlistItemStatus,
  now: Date,
  finishedAt?: Date,
): { status: WatchlistItemStatus; startedAt?: Date; finishedAt?: Date | null; updatedAt: Date } {
  const entering = isWatchedStatus(next) && !isWatchedStatus(current.status);
  const leaving = !isWatchedStatus(next) && isWatchedStatus(current.status);
  return {
    status: next,
    ...(!current.startedAt && WATCHING_STATUSES.has(next) && { startedAt: now }),
    ...(entering && { finishedAt: finishedAt ?? now }),
    ...(leaving && { finishedAt: null }),
    updatedAt: now,
  };
}
