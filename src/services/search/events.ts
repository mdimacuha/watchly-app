import 'server-only';

import { z } from 'zod';
import { db } from '@/db';
import { searchEvents } from '@/db/schema';
import { logger } from '@/lib/log';
import { ValidationAppError } from '@/utils/errors';

export const SEARCH_EVENT_KINDS = [
  'search_performed',
  'result_opened',
  'keyword_chip_clicked',
  'endcap_shown',
] as const;

const MAX_METADATA_CHARS = 2000;

const eventSchema = z.object({
  event: z.enum(SEARCH_EVENT_KINDS),
  query: z.string().trim().max(200).optional(),
  metadata: z
    .record(z.string(), z.unknown())
    .optional()
    .refine((m) => !m || JSON.stringify(m).length <= MAX_METADATA_CHARS, {
      message: 'metadata too large',
    }),
});

export const recordSearchEventsSchema = z.object({
  // Anonymous per-tab id from the client (crypto.randomUUID()).
  sessionId: z.string().min(8).max(64),
  events: z.array(eventSchema).min(1).max(20),
});

/**
 * Appends client-reported search events. Public (guests search too), so the
 * input is strictly validated and size-capped; the user id comes from the
 * session, never the client. Best-effort: a failed insert is logged and
 * swallowed — analytics must never break search.
 */
export async function recordSearchEvents(
  userId: string | null,
  input: unknown,
): Promise<{ recorded: number }> {
  const parsed = recordSearchEventsSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationAppError('Invalid search events', parsed.error.flatten());
  }
  const { sessionId, events } = parsed.data;
  try {
    await db.insert(searchEvents).values(
      events.map((e) => ({
        userId,
        sessionId,
        event: e.event,
        query: e.query ?? null,
        metadata: e.metadata ?? null,
      })),
    );
    return { recorded: events.length };
  } catch (err) {
    logger.warn('Failed to record search events', { count: events.length, err });
    return { recorded: 0 };
  }
}
