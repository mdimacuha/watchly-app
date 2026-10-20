// "When did you see it?" dates, shared by the watched service (ordering) and
// the ticket stubs (labels, grouping, the date editor). Client-safe.

/** Page size of the profile's Watched tab ("Show more" loads the next). */
export const WATCHED_PAGE_SIZE = 60;

export type WatchedPrecision = 'day' | 'month' | 'year' | 'unknown';

const PRECISION_RANK: Record<WatchedPrecision, number> = { day: 0, month: 1, year: 2, unknown: 3 };

/**
 * Newest first. Month/year dates sit on the 1st of their period, so they
 * fall at the end of it; on a tie the more exact date leads. Undated
 * ('unknown') entries go last.
 */
export function compareWatched(
  a: { watchedAt: Date | string; precision: WatchedPrecision },
  b: { watchedAt: Date | string; precision: WatchedPrecision },
): number {
  const au = a.precision === 'unknown';
  const bu = b.precision === 'unknown';
  if (au !== bu) return au ? 1 : -1;
  const dt = new Date(b.watchedAt).getTime() - new Date(a.watchedAt).getTime();
  return dt !== 0 ? dt : PRECISION_RANK[a.precision] - PRECISION_RANK[b.precision];
}

/** A `seen_on` date ('YYYY-MM-DD') as noon UTC, so it stays on its day in every timezone that matters. */
export const seenOnToDate = (d: string) => new Date(`${d}T12:00:00Z`);

export interface SeenParts {
  year: number;
  /** 0–11, null below month precision. */
  month: number | null;
  /** 1–31, null below day precision. */
  day: number | null;
}

/**
 * Calendar parts of a watched date. Hand-set dates are stored at noon UTC
 * and read in UTC; logged timestamps are read in the viewer's timezone.
 */
export function seenParts(watchedAt: string, precision: WatchedPrecision, confirmed: boolean): SeenParts {
  const d = new Date(watchedAt);
  const utc = confirmed;
  const year = utc ? d.getUTCFullYear() : d.getFullYear();
  const month = utc ? d.getUTCMonth() : d.getMonth();
  const day = utc ? d.getUTCDate() : d.getDate();
  return {
    year,
    month: precision === 'day' || precision === 'month' ? month : null,
    day: precision === 'day' ? day : null,
  };
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
export { MONTHS_SHORT, MONTHS_LONG };

/** The stub's date: "Oct 20, 2026", "Mar 2019", "in 2019", or null when undated. */
export function seenLabel(parts: SeenParts | null): string | null {
  if (!parts) return null;
  if (parts.month === null) return `in ${parts.year}`;
  if (parts.day === null) return `${MONTHS_SHORT[parts.month]} ${parts.year}`;
  return `${MONTHS_SHORT[parts.month]} ${String(parts.day).padStart(2, '0')}, ${parts.year}`;
}

/** Back to the stored form: 'YYYY-MM-DD' on the 1st of the period (null when undated). */
export function seenToDate(parts: SeenParts | null): { date: string | null; precision: WatchedPrecision } {
  if (!parts) return { date: null, precision: 'unknown' };
  const mm = String((parts.month ?? 0) + 1).padStart(2, '0');
  const dd = String(parts.day ?? 1).padStart(2, '0');
  const precision: WatchedPrecision = parts.month === null ? 'year' : parts.day === null ? 'month' : 'day';
  return { date: `${parts.year}-${mm}-${dd}`, precision };
}

/** The stored form as the ISO instant the list sorts on (noon UTC). */
export function seenToInstant(parts: SeenParts): string {
  const { date } = seenToDate(parts);
  return seenOnToDate(date!).toISOString();
}

export const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
