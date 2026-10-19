import { db } from '@/db';
import { titleAlerts } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';
import { mapWithConcurrency } from '@/lib/concurrency';
import { createNotification } from '@/services/notifications';
import { getTitleState, type TitleState } from './titleState';

// The daily alert check (run by the cron route). Alerts least recently
// checked go first, so a run that hits its limit picks up where the last one
// stopped. Each (title, region) is looked up once however many users watch it.

export interface TitleAlertCheckResult {
  checked: number;
  titles: number;
  notified: number;
  failed: number;
}

/** Alerts per run; keeps a run well inside the function time limit. */
const CHECK_BATCH = 500;

type AlertRow = {
  id: string;
  userId: string;
  mediaType: 'movie' | 'tv';
  mediaId: string;
  region: string;
  notifyStreaming: boolean;
  notifyLeaving: boolean;
  notifyNewSeason: boolean;
  lastProviders: string[];
  lastSeasonNumber: number | null;
};

export async function runTitleAlertCheck({ limit = CHECK_BATCH }: { limit?: number } = {}): Promise<TitleAlertCheckResult> {
  const rows: AlertRow[] = await db
    .select({
      id: titleAlerts.id,
      userId: titleAlerts.userId,
      mediaType: titleAlerts.mediaType,
      mediaId: titleAlerts.mediaId,
      region: titleAlerts.region,
      notifyStreaming: titleAlerts.notifyStreaming,
      notifyLeaving: titleAlerts.notifyLeaving,
      notifyNewSeason: titleAlerts.notifyNewSeason,
      lastProviders: titleAlerts.lastProviders,
      lastSeasonNumber: titleAlerts.lastSeasonNumber,
    })
    .from(titleAlerts)
    .orderBy(sql`${titleAlerts.lastCheckedAt} ASC NULLS FIRST`)
    .limit(limit);

  const groups = new Map<string, AlertRow[]>();
  for (const r of rows) {
    const key = `${r.mediaType}:${r.mediaId}:${r.region}`;
    const list = groups.get(key);
    if (list) list.push(r);
    else groups.set(key, [r]);
  }

  let notified = 0;
  let failed = 0;
  await mapWithConcurrency([...groups.values()], 4, async (group) => {
    const { mediaType, mediaId, region } = group[0];
    let state: TitleState;
    try {
      state = await getTitleState(mediaType, mediaId, region, { fresh: true });
    } catch (error: unknown) {
      console.warn(`Title alert check failed for ${mediaType} ${mediaId} (${region})`, error);
      failed += group.length;
      // Still move them to the back of the queue; tomorrow retries.
      await Promise.all(
        group.map((r) => db.update(titleAlerts).set({ lastCheckedAt: new Date() }).where(eq(titleAlerts.id, r.id))),
      );
      return;
    }
    for (const row of group) {
      // Await first: `notified += await …` reads the total before the await
      // and would drop counts from groups running alongside.
      const sent = await applyCheck(row, state);
      notified += sent;
    }
  });

  return { checked: rows.length, titles: groups.size, notified, failed };
}

/** Diff one alert against the title's state, notify, and move the snapshot. Returns notifications sent. */
async function applyCheck(row: AlertRow, state: TitleState): Promise<number> {
  const base = { mediaType: row.mediaType, mediaId: row.mediaId, region: row.region };
  const sends: { type: 'title_available' | 'title_leaving' | 'title_new_season'; payload: Record<string, unknown> }[] = [];

  const prev = row.lastProviders ?? [];
  const now = state.providers;
  const nowKeys = new Set(now.map((p) => p.toLowerCase()));
  const prevKeys = new Set(prev.map((p) => p.toLowerCase()));

  if (row.notifyStreaming && prev.length === 0 && now.length > 0) {
    sends.push({ type: 'title_available', payload: { ...base, providers: now } });
  }
  // An unknown answer can't prove a service dropped it.
  const removed = state.providersKnown ? prev.filter((p) => !nowKeys.has(p.toLowerCase())) : [];
  if (row.notifyLeaving && removed.length > 0) {
    sends.push({ type: 'title_leaving', payload: { ...base, providers: removed } });
  }
  if (
    row.notifyNewSeason &&
    row.mediaType === 'tv' &&
    state.latestSeason !== null &&
    state.latestSeason > (row.lastSeasonNumber ?? 0)
  ) {
    sends.push({ type: 'title_new_season', payload: { ...base, seasonNumber: state.latestSeason } });
  }

  let sent = 0;
  for (const s of sends) {
    try {
      if (await createNotification({ userId: row.userId, actorId: null, type: s.type, payload: s.payload })) sent++;
    } catch (error: unknown) {
      console.warn(`Title alert notification failed (${s.type})`, error);
    }
  }

  // Keep the old provider list when the answer was unknown and lost data.
  const keepProviders = !state.providersKnown && now.length === 0;
  const providersChanged = !keepProviders && (now.length !== prev.length || now.some((p) => !prevKeys.has(p.toLowerCase())));
  await db
    .update(titleAlerts)
    .set({
      ...(providersChanged ? { lastProviders: now } : {}),
      lastSeasonNumber: state.latestSeason ?? row.lastSeasonNumber,
      lastCheckedAt: new Date(),
    })
    .where(eq(titleAlerts.id, row.id));
  return sent;
}
