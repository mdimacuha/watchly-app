'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '@/server/auth/session';
import { z } from 'zod';
import { UnauthorizedAppError, ValidationAppError } from '@/utils/errors';
import {
  markAsWatched,
  restoreSeenDate,
  restoreWatched,
  setSeenDate,
  unmarkWatched,
  getWatchOf,
  getWatchedKeySet,
  logWatch,
  restoreLogWatch,
  type LogWatchSnapshot,
  type SeenSnapshot,
  type UnwatchSnapshot,
  type WatchedPrecision,
} from '@/services/watched';
import { tmdbFetch } from '@/server/tmdb/client';
import { TmdbError } from '@/server/tmdb/errors';
import { WATCHED_STATUSES } from '@/services/watchlists/validators';

/**
 * Server actions for the Watched surface on /me and the For You hero.
 * `markAsWatchedAction` lives here alongside `unmarkWatchedAction` so
 * components have a single import. The forYou.ts copy is kept (it
 * re-exports markAsWatched too) to avoid breaking the existing hero
 * call site — both paths land in the same service function.
 */

async function requireUserId(): Promise<string> {
  const session = await getSession();
  if (!session) throw new UnauthorizedAppError();
  return session.userId;
}

export async function markAsWatchedAction(
  mediaType: 'movie' | 'tv',
  mediaId: string,
): Promise<'watchlist_finished' | 'watched_table'> {
  const userId = await requireUserId();
  const where = await markAsWatched(userId, mediaType, mediaId);
  revalidatePath('/for-you');
  revalidatePath('/me');
  return where;
}

/**
 * Reverses Mark as Watched. Deletes the watched_titles row AND, if a
 * matching watchlist item exists with status='finished', flips it back
 * to 'watching' + clears finishedAt — so the title leaves the user's
 * watched set entirely.
 */
export async function unmarkWatchedAction(
  mediaType: 'movie' | 'tv',
  mediaId: string,
): Promise<UnwatchSnapshot> {
  const userId = await requireUserId();
  const snapshot = await unmarkWatched(userId, mediaType, mediaId);
  revalidatePath('/me');
  revalidatePath('/for-you');
  return snapshot;
}

const seenStateSchema = z.object({
  seenOn: z.iso.date().nullable(),
  seenPrecision: z.enum(['day', 'month', 'year', 'unknown']).nullable(),
  source: z.enum(['mark', 'review', 'edited', 'backfill']),
});

const snapshotSchema = z.object({
  watchedAt: z.iso.datetime().nullable(),
  seen: seenStateSchema.nullable(),
  items: z
    .array(
      z.object({
        id: z.uuid(),
        status: z.enum(WATCHED_STATUSES),
        finishedAt: z.iso.datetime().nullable(),
      }),
    )
    .max(50),
});

/** "Undo" after removing a title from watched: puts back what `unmarkWatchedAction` undid. */
export async function restoreWatchedAction(
  mediaType: 'movie' | 'tv',
  mediaId: string,
  snapshot: UnwatchSnapshot,
): Promise<void> {
  const userId = await requireUserId();
  const parsed = snapshotSchema.safeParse(snapshot);
  const type = z.enum(['movie', 'tv']).safeParse(mediaType);
  if (!parsed.success || !type.success || !/^\d+$/.test(mediaId)) throw new ValidationAppError('Invalid undo');
  await restoreWatched(userId, type.data, mediaId, parsed.data);
  revalidatePath('/me');
  revalidatePath('/for-you');
}

// ---------------------------------------------------------------------------
// Seen dates ("When did you see it?" on a ticket stub)
// ---------------------------------------------------------------------------

const titleRefSchema = z.object({
  mediaType: z.enum(['movie', 'tv']),
  mediaId: z.string().regex(/^\d+$/),
});

// Month/year dates are the 1st of their period; 'unknown' has no date.
const seenInputSchema = z
  .object({ precision: z.enum(['day', 'month', 'year', 'unknown']), date: z.iso.date().nullable() })
  .refine((v) => (v.precision === 'unknown' ? v.date === null : v.date !== null), 'Pick a date')
  .refine((v) => v.precision !== 'month' || v.date?.endsWith('-01'), 'Month dates start on the 1st')
  .refine((v) => v.precision !== 'year' || v.date?.endsWith('-01-01'), 'Year dates start on Jan 1');

/** Compares the period a date covers at a precision: -1 before, 0 overlapping, 1 after. */
function comparePeriod(date: string, ref: string, precision: WatchedPrecision): number {
  const len = precision === 'year' ? 4 : precision === 'month' ? 7 : 10;
  const a = date.slice(0, len);
  const b = ref.slice(0, len);
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Whether the title exists and when it came out. `found` is null when TMDB
 * couldn't be reached (callers allow the edit rather than block the member).
 */
async function titleFacts(
  mediaType: 'movie' | 'tv',
  mediaId: string,
): Promise<{ found: boolean | null; release: string | null }> {
  try {
    const raw = await tmdbFetch<{ release_date?: string; first_air_date?: string }>(`/${mediaType}/${mediaId}`);
    const d = mediaType === 'movie' ? raw.release_date : raw.first_air_date;
    return { found: true, release: d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null };
  } catch (err) {
    return { found: err instanceof TmdbError && err.status === 404 ? false : null, release: null };
  }
}

/** Why a seen date can't be used (future, or before release), or null when it's fine. */
function seenDateProblem(date: string | null, precision: WatchedPrecision, release: string | null): string | null {
  if (!date) return null;
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  if (date > tomorrow) return "That date hasn't happened yet.";
  if (release && comparePeriod(date, release, precision) < 0) {
    const out = new Date(`${release}T12:00:00Z`).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    });
    return `It came out on ${out}. Pick a date from then on.`;
  }
  return null;
}

/**
 * Sets when the viewer saw a watched title. Rejects dates in the future
 * (a day of slack for timezones) and before the title came out.
 */
export async function setSeenDateAction(
  mediaType: 'movie' | 'tv',
  mediaId: string,
  seen: { precision: WatchedPrecision; date: string | null },
): Promise<{ ok: true; snapshot: SeenSnapshot } | { ok: false; error: string }> {
  const userId = await requireUserId();
  const ref = titleRefSchema.safeParse({ mediaType, mediaId });
  const input = seenInputSchema.safeParse(seen);
  if (!ref.success) throw new ValidationAppError('Invalid title');
  if (!input.success) return { ok: false, error: input.error.issues[0]?.message ?? 'Invalid date' };
  const { precision, date } = input.data;

  if (date) {
    const { release } = await titleFacts(ref.data.mediaType, ref.data.mediaId);
    const problem = seenDateProblem(date, precision, release);
    if (problem) return { ok: false, error: problem };
  }

  const snapshot = await setSeenDate(userId, ref.data.mediaType, ref.data.mediaId, { precision, date });
  revalidatePath('/me');
  return { ok: true, snapshot };
}

const seenSnapshotSchema = z.discriminatedUnion('existed', [
  z.object({ existed: z.literal(false) }),
  z.object({ existed: z.literal(true), state: seenStateSchema }),
]);

/** "Undo" after changing a seen date. */
export async function restoreSeenDateAction(
  mediaType: 'movie' | 'tv',
  mediaId: string,
  snapshot: SeenSnapshot,
): Promise<void> {
  const userId = await requireUserId();
  const ref = titleRefSchema.safeParse({ mediaType, mediaId });
  const parsed = seenSnapshotSchema.safeParse(snapshot);
  if (!ref.success || !parsed.success) throw new ValidationAppError('Invalid undo');
  await restoreSeenDate(userId, ref.data.mediaType, ref.data.mediaId, parsed.data);
  revalidatePath('/me');
}

// ---------------------------------------------------------------------------
// "Seen it" (title page, Quick View, search) and Log a watch
// ---------------------------------------------------------------------------

export type WatchOf = Awaited<ReturnType<typeof getWatchOf>>;

/** The viewer's watch of a title for a "Seen it" button; null when unwatched or signed out. */
export async function getWatchOfAction(mediaType: 'movie' | 'tv', mediaId: string): Promise<WatchOf> {
  const session = await getSession();
  const ref = titleRefSchema.safeParse({ mediaType, mediaId });
  if (!session || !ref.success) return null;
  return getWatchOf(session.userId, ref.data.mediaType, ref.data.mediaId);
}

/** Every `${type}:${id}` the viewer has watched (search cards mark them); empty when signed out. */
export async function getWatchedKeysAction(): Promise<string[]> {
  const session = await getSession();
  if (!session) return [];
  return [...(await getWatchedKeySet(session.userId))];
}

export type LogWatchResult =
  | { ok: true; already: boolean; snapshot: LogWatchSnapshot; watch: WatchOf }
  | { ok: false; error: string };

/**
 * Marks a title watched from anywhere. `seen` dates it at once (Log a
 * watch); without it the date is "now" and the caller offers to change it.
 * `past` marks it as a backfilled past watch (daily limit).
 */
export async function logWatchAction(
  mediaType: 'movie' | 'tv',
  mediaId: string,
  opts: { seen?: { precision: WatchedPrecision; date: string | null } | null; past?: boolean } = {},
): Promise<LogWatchResult> {
  const userId = await requireUserId();
  const ref = titleRefSchema.safeParse({ mediaType, mediaId });
  if (!ref.success) throw new ValidationAppError('Invalid title');
  let seen: { precision: WatchedPrecision; date: string | null } | null = null;
  if (opts.seen) {
    const input = seenInputSchema.safeParse(opts.seen);
    if (!input.success) return { ok: false, error: input.error.issues[0]?.message ?? 'Invalid date' };
    seen = input.data;
  }

  const facts = await titleFacts(ref.data.mediaType, ref.data.mediaId);
  if (facts.found === false) return { ok: false, error: "We couldn't find that title." };
  const problem = seen ? seenDateProblem(seen.date, seen.precision, facts.release) : null;
  if (problem) return { ok: false, error: problem };

  try {
    const { already, snapshot } = await logWatch(
      userId,
      ref.data.mediaType,
      ref.data.mediaId,
      seen,
      opts.past ? 'backfill' : 'mark',
    );
    const watch = await getWatchOf(userId, ref.data.mediaType, ref.data.mediaId);
    revalidatePath('/me');
    revalidatePath('/for-you');
    return { ok: true, already, snapshot, watch };
  } catch (err) {
    if (err instanceof ValidationAppError) return { ok: false, error: err.message };
    throw err;
  }
}

const logSnapshotSchema = z.object({
  createdRow: z.boolean(),
  items: z
    .array(
      z.object({
        id: z.uuid(),
        status: z.enum([
          'just_added',
          'up_next',
          'watching',
          'waiting_for_episode',
          'waiting_for_season',
          'paused',
          'finished',
          'rewatch',
          'dropped',
        ]),
        finishedAt: z.iso.datetime().nullable(),
        startedAt: z.iso.datetime().nullable(),
      }),
    )
    .max(50),
});

/** "Undo" after Seen it / Log a watch. */
export async function restoreLogWatchAction(
  mediaType: 'movie' | 'tv',
  mediaId: string,
  snapshot: LogWatchSnapshot,
): Promise<void> {
  const userId = await requireUserId();
  const ref = titleRefSchema.safeParse({ mediaType, mediaId });
  const parsed = logSnapshotSchema.safeParse(snapshot);
  if (!ref.success || !parsed.success) throw new ValidationAppError('Invalid undo');
  await restoreLogWatch(userId, ref.data.mediaType, ref.data.mediaId, parsed.data);
  revalidatePath('/me');
  revalidatePath('/for-you');
}
