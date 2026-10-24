import 'server-only';

import { and, desc, eq, gte, inArray, or, sql } from 'drizzle-orm';
import { db } from '@/db';
import { forYouEvents, searchEvents } from '@/db/schema';

/**
 * Light, implicit taste signals for the taste profile: titles a user showed
 * interest in without saving them. They only nudge the profile (see
 * BROWSING_WEIGHT in services/profile) and are private like swipes — never
 * part of a visitor's view.
 *
 *   - Search: a movie or show opened from search results.
 *   - For You: a reel trailer watched for a while, the reel's "More about it",
 *     or a title opened from Tonight's Programme.
 *
 * A short reel view is a skip, and a skip is never a signal either way.
 */

/** How far back browsing counts. */
const BROWSING_WINDOW_DAYS = 90;
/** Reel views shorter than this are skips. */
const MIN_REEL_DWELL_MS = 15_000;
/** Rows read per table before dedup; newest first. */
const ROW_LIMIT = 200;

export interface BrowsingTitle {
  mediaType: 'movie' | 'tv';
  mediaId: string;
}

/** Distinct titles, newest interest first. */
export async function getBrowsingSignals(userId: string): Promise<BrowsingTitle[]> {
  const since = new Date(Date.now() - BROWSING_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const [searchRows, forYouRows] = await Promise.all([
    db
      .select({
        mediaType: sql<string | null>`${searchEvents.metadata}->>'mediaType'`,
        mediaId: sql<string | null>`${searchEvents.metadata}->>'id'`,
        at: searchEvents.createdAt,
      })
      .from(searchEvents)
      .where(
        and(
          eq(searchEvents.userId, userId),
          eq(searchEvents.event, 'result_opened'),
          gte(searchEvents.createdAt, since),
        ),
      )
      .orderBy(desc(searchEvents.createdAt))
      .limit(ROW_LIMIT),
    db
      .select({ titleKey: forYouEvents.titleKey, at: forYouEvents.createdAt })
      .from(forYouEvents)
      .where(
        and(
          eq(forYouEvents.userId, userId),
          gte(forYouEvents.createdAt, since),
          or(
            inArray(forYouEvents.event, ['title_opened', 'details_opened']),
            and(
              eq(forYouEvents.event, 'item_viewed'),
              // Client-reported: cast only real numbers (CASE fixes evaluation order).
              sql`case when jsonb_typeof(${forYouEvents.metadata}->'dwellMs') = 'number'
                then (${forYouEvents.metadata}->>'dwellMs')::numeric else 0 end >= ${MIN_REEL_DWELL_MS}`,
            ),
          ),
        ),
      )
      .orderBy(desc(forYouEvents.createdAt))
      .limit(ROW_LIMIT),
  ]);

  const dated: (BrowsingTitle & { at: Date })[] = [];
  for (const r of searchRows) {
    const title = toTitle(r.mediaType, r.mediaId);
    if (title) dated.push({ ...title, at: r.at });
  }
  for (const r of forYouRows) {
    const [type, id] = (r.titleKey ?? '').split(':');
    const title = toTitle(type, id);
    if (title) dated.push({ ...title, at: r.at });
  }

  dated.sort((a, b) => b.at.getTime() - a.at.getTime());
  const seen = new Set<string>();
  const out: BrowsingTitle[] = [];
  for (const t of dated) {
    const key = `${t.mediaType}:${t.mediaId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ mediaType: t.mediaType, mediaId: t.mediaId });
  }
  return out;
}

function toTitle(type: string | null | undefined, id: string | number | null | undefined): BrowsingTitle | null {
  if (type !== 'movie' && type !== 'tv') return null;
  const mediaId = String(id ?? '');
  if (!/^\d+$/.test(mediaId)) return null;
  return { mediaType: type, mediaId };
}
