import { formatRuntime } from '@/lib/format';
import type { LastWatchedTicket } from '@/services/watched/lastWatched';

// What the last-watched ticket says, in one pure function shared by the
// profile and the story export. We store when a watch was logged (exact)
// and, if the member set it, the day they saw it (no time). The start time is
// only worked out when it can be honest: a film, a known runtime, and either
// no hand-set day or one that's the same night as the log (then "logged at"
// is the end of the screening, so started = logged − runtime). A hand-set day
// that differs from the log gets no times.
//
// Clock times are for the owner only, in their timezone: the browser's own
// on the profile, the one their browser sends for the story export. We
// don't store the owner's timezone, so a visitor never sees a clock time.
//
//   film + runtime, owner        → "Started 9pm · logged 11:30pm"
//   …starting 00:00–04:59        → "Late show 1:15am · logged 3:45am", dated the evening before
//   film + runtime, visitor      → "2h 49m feature"
//   hand-set day, same night     → as a film above, dated that day
//   hand-set day, another day    → "Seen Oct 23 · logged Oct 30"
//   series                       → "Finished the series · logged 11:30pm"
//   no runtime                   → "Logged 11:30pm"

export interface TicketCopy {
  /** "October 24, 2026": the night it was seen. */
  date: string;
  /** Short date for tight faces: "Oct 24". */
  shortDate: string;
  /** The quirk line; null when there's nothing true to add. */
  quirk: string | null;
  /** Started and logged, already formatted (owner, film, known runtime). */
  showtime: { start: string; logged: string; late: boolean } | null;
  runtime: string | null;
}

const MIN = 60_000;

interface Parts {
  y: number;
  mo: number;
  d: number;
  h: number;
  mi: number;
}

/** Wall-clock parts of an instant in a timezone (undefined = the runtime's local zone). */
function partsIn(date: Date, tz?: string): Parts {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' });
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute };
}

/** "9pm", "9:15pm". */
function clockOf({ h, mi }: Parts): string {
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}${mi ? `:${String(mi).padStart(2, '0')}` : ''}${h < 12 ? 'am' : 'pm'}`;
}

const dayKey = ({ y, mo, d }: Parts) => `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const long = (date: Date, tz?: string) => date.toLocaleDateString('en-US', { timeZone: tz, month: 'long', day: 'numeric', year: 'numeric' });
const short = (date: Date, tz?: string) => date.toLocaleDateString('en-US', { timeZone: tz, month: 'short', day: 'numeric' });

export function ticketCopy(t: LastWatchedTicket, owner: boolean, timeZone?: string): TicketCopy {
  const logged = new Date(t.loggedAt);
  const lp = partsIn(logged, timeZone);
  const runtime = formatRuntime(t.runtime);
  const clock = (d: Date) => clockOf(partsIn(d, timeZone));

  // A hand-set day is a calendar date: noon UTC, shown in UTC.
  const seen = t.seenOn ? new Date(`${t.seenOn}T12:00:00Z`) : null;
  // A log in the small hours belongs to the night before.
  const loggedNightKey = lp.h < 5 ? dayKey(partsIn(new Date(logged.getTime() - 6 * 60 * MIN), timeZone)) : dayKey(lp);
  const sameNight = !t.seenOn || t.seenOn === dayKey(lp) || t.seenOn === loggedNightKey;

  if (seen && !sameNight) {
    return { date: long(seen, 'UTC'), shortDate: short(seen, 'UTC'), quirk: `Seen ${short(seen, 'UTC')} · logged ${short(logged, timeZone)}`, showtime: null, runtime };
  }

  if (t.mediaType === 'movie' && t.runtime) {
    const start = new Date(Math.round((logged.getTime() - t.runtime * MIN) / (15 * MIN)) * 15 * MIN);
    const late = partsIn(start, timeZone).h < 5;
    // A late show belongs to the evening it started on; a hand-set day wins.
    const [date, shortDate] = seen
      ? [long(seen, 'UTC'), short(seen, 'UTC')]
      : late
        ? [long(new Date(start.getTime() - 6 * 60 * MIN), timeZone), short(new Date(start.getTime() - 6 * 60 * MIN), timeZone)]
        : [long(start, timeZone), short(start, timeZone)];
    return {
      date,
      shortDate,
      quirk: owner ? `${late ? 'Late show' : 'Started'} ${clock(start)} · logged ${clock(logged)}` : `${runtime} feature`,
      showtime: owner ? { start: clock(start), logged: clock(logged), late } : null,
      runtime,
    };
  }

  if (seen) {
    return { date: long(seen, 'UTC'), shortDate: short(seen, 'UTC'), quirk: owner ? `Logged ${clock(logged)}` : null, showtime: null, runtime };
  }

  if (t.mediaType === 'tv') {
    return { date: long(logged, timeZone), shortDate: short(logged, timeZone), quirk: owner ? `Finished the series · logged ${clock(logged)}` : 'Finished the series', showtime: null, runtime };
  }

  return { date: long(logged, timeZone), shortDate: short(logged, timeZone), quirk: owner ? `Logged ${clock(logged)}` : null, showtime: null, runtime };
}

/** The receipt's rows: Date · Started · Logged · Runtime (or a Note when there's no start time). */
export function receiptRows(copy: TicketCopy | null): [string, string][] {
  const rows: [string, string][] = [['Date', copy?.date ?? '—']];
  const st = copy?.showtime;
  if (st) rows.push(['Started', `${st.start}${st.late ? ' · late show' : ''}`], ['Logged', st.logged]);
  else if (copy?.quirk) rows.push(['Note', copy.quirk]);
  if (copy?.runtime) rows.push(['Runtime', copy.runtime]);
  return rows;
}
