import 'server-only';

import { z } from 'zod';
import { db } from '@/db';
import { watchlistEvents } from '@/db/schema';
import { logger } from '@/lib/log';
import { ValidationAppError } from '@/utils/errors';

/**
 * Needs your attention + Tidy up (see watchlist_events in db/schema.ts).
 * Shown and dismissed are reported by the page; actions and undos are
 * logged by the Tidy up service itself.
 */
export const WATCHLIST_EVENT_KINDS = [
  'attention_shown',
  'attention_dismissed',
  'tidy_opened',
  'tidy_action',
  'tidy_undo',
  // More for this list, and where every add comes from (the baseline for adds).
  'recs_opened',
  'recs_shown',
  'title_added',
] as const;
export type WatchlistEventKind = (typeof WATCHLIST_EVENT_KINDS)[number];

const MAX_METADATA_CHARS = 2000;

const clientEventSchema = z.object({
  event: z.enum(['attention_shown', 'tidy_opened', 'recs_opened']),
  metadata: z
    .record(z.string(), z.unknown())
    .optional()
    .refine((m) => !m || JSON.stringify(m).length <= MAX_METADATA_CHARS, { message: 'metadata too large' }),
});

/** Best-effort: analytics never break the page. */
export async function logWatchlistEvent(userId: string, event: WatchlistEventKind, metadata?: Record<string, unknown>): Promise<void> {
  try {
    await db.insert(watchlistEvents).values({ userId, event, metadata: metadata ?? null });
  } catch (err) {
    logger.warn('Failed to log watchlist event', { event, err });
  }
}

/** A page-reported event, validated; the user id comes from the session. */
export async function recordWatchlistEvent(userId: string, input: unknown): Promise<void> {
  const parsed = clientEventSchema.safeParse(input);
  if (!parsed.success) throw new ValidationAppError('Invalid watchlist event', parsed.error.flatten());
  await logWatchlistEvent(userId, parsed.data.event, parsed.data.metadata);
}
