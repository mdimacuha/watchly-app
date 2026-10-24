import type { z } from 'zod';
import { db } from '@/db';
import { titleAlerts } from '@/db/schema';
import { and, count, desc, eq } from 'drizzle-orm';
import { tmdbFetch } from '@/server/tmdb/client';
import { mapWithConcurrency } from '@/lib/concurrency';
import { ValidationAppError } from '@/utils/errors';
import { invalidateNewFeed } from '@/services/newReleases/cacheTag';
import { getTitleState } from './titleState';
import { ALERTS_PER_USER_MAX, alertTitleSchema, setTitleAlertSchema } from './validators';

export { runTitleAlertCheck, type TitleAlertCheckResult } from './check';

// "Notify me when" alerts on a title. One row per user per title holds the
// chosen alerts, the region they watch and a snapshot of what was true when
// they were set, so the daily check only reports changes.

export interface TitleAlertSettings {
  streaming: boolean;
  leaving: boolean;
  newSeason: boolean;
  /** Region the alert watches; null when no alert is set. */
  region: string | null;
}

const NO_ALERT: TitleAlertSettings = { streaming: false, leaving: false, newSeason: false, region: null };

function parseOrThrow<S extends z.ZodTypeAny>(schema: S, input: unknown): z.infer<S> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new ValidationAppError(parsed.error.issues[0]?.message ?? 'Invalid request');
  return parsed.data;
}

export async function getTitleAlert(userId: string, input: unknown): Promise<TitleAlertSettings> {
  const { mediaType, mediaId } = parseOrThrow(alertTitleSchema, input);
  const [row] = await db
    .select({
      streaming: titleAlerts.notifyStreaming,
      leaving: titleAlerts.notifyLeaving,
      newSeason: titleAlerts.notifyNewSeason,
      region: titleAlerts.region,
    })
    .from(titleAlerts)
    .where(and(eq(titleAlerts.userId, userId), eq(titleAlerts.mediaType, mediaType), eq(titleAlerts.mediaId, mediaId)))
    .limit(1);
  return row ?? NO_ALERT;
}

/**
 * Set the alerts for a title. All off deletes the row. A new alert, or one
 * moved to another region, snapshots the title's current state first so it
 * never fires for what's already true.
 */
export async function setTitleAlert(userId: string, input: unknown): Promise<TitleAlertSettings> {
  const data = parseOrThrow(setTitleAlertSchema, input);
  const where = and(
    eq(titleAlerts.userId, userId),
    eq(titleAlerts.mediaType, data.mediaType),
    eq(titleAlerts.mediaId, data.mediaId),
  );
  // Seasons only exist on tv.
  const newSeason = data.mediaType === 'tv' && data.newSeason;

  if (!data.streaming && !data.leaving && !newSeason) {
    await db.delete(titleAlerts).where(where);
    invalidateNewFeed(userId); // followed shows feed /new
    return NO_ALERT;
  }

  const [existing] = await db.select({ region: titleAlerts.region }).from(titleAlerts).where(where).limit(1);
  const flags = {
    notifyStreaming: data.streaming,
    notifyLeaving: data.leaving,
    notifyNewSeason: newSeason,
    region: data.region,
    updatedAt: new Date(),
  };

  if (existing && existing.region === data.region) {
    await db.update(titleAlerts).set(flags).where(where);
  } else {
    if (!existing) {
      const [{ n }] = await db.select({ n: count() }).from(titleAlerts).where(eq(titleAlerts.userId, userId));
      if (n >= ALERTS_PER_USER_MAX) {
        throw new ValidationAppError(`You can keep up to ${ALERTS_PER_USER_MAX} title alerts`);
      }
    }
    const state = await getTitleState(data.mediaType, data.mediaId, data.region);
    const snapshot = {
      lastProviders: state.providers,
      lastSeasonNumber: state.latestSeason,
      lastCheckedAt: new Date(),
    };
    await db
      .insert(titleAlerts)
      .values({ userId, mediaType: data.mediaType, mediaId: data.mediaId, ...flags, ...snapshot })
      .onConflictDoUpdate({
        target: [titleAlerts.userId, titleAlerts.mediaType, titleAlerts.mediaId],
        set: { ...flags, ...snapshot },
      });
    invalidateNewFeed(userId);
  }

  return { streaming: data.streaming, leaving: data.leaving, newSeason, region: data.region };
}

export async function removeTitleAlert(userId: string, input: unknown): Promise<void> {
  const { mediaType, mediaId } = parseOrThrow(alertTitleSchema, input);
  await db
    .delete(titleAlerts)
    .where(and(eq(titleAlerts.userId, userId), eq(titleAlerts.mediaType, mediaType), eq(titleAlerts.mediaId, mediaId)));
  invalidateNewFeed(userId);
}

export interface TitleAlertListItem extends TitleAlertSettings {
  mediaType: 'movie' | 'tv';
  mediaId: string;
  region: string;
  title: string;
  posterPath: string | null;
}

/** The user's alerts, newest first, with title and poster for the settings list. */
export async function listTitleAlerts(userId: string): Promise<TitleAlertListItem[]> {
  const rows = await db
    .select({
      mediaType: titleAlerts.mediaType,
      mediaId: titleAlerts.mediaId,
      region: titleAlerts.region,
      streaming: titleAlerts.notifyStreaming,
      leaving: titleAlerts.notifyLeaving,
      newSeason: titleAlerts.notifyNewSeason,
    })
    .from(titleAlerts)
    .where(eq(titleAlerts.userId, userId))
    .orderBy(desc(titleAlerts.createdAt))
    .limit(ALERTS_PER_USER_MAX);

  return mapWithConcurrency(rows, 6, async (r) => {
    try {
      const raw = await tmdbFetch<{ title?: string; name?: string; poster_path?: string | null }>(
        `/${r.mediaType}/${r.mediaId}`,
      );
      return { ...r, title: raw.title ?? raw.name ?? 'Untitled', posterPath: raw.poster_path ?? null };
    } catch {
      return { ...r, title: 'Untitled', posterPath: null };
    }
  });
}
