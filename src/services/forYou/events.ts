import 'server-only';

import { z } from 'zod';
import { db } from '@/db';
import { forYouEvents } from '@/db/schema';
import { logger } from '@/lib/log';
import { ValidationAppError } from '@/utils/errors';

const MAX_METADATA_CHARS = 2000;

const eventSchema = z.object({
  event: z.enum(['feed_viewed', 'title_opened', 'spin', 'filter_changed', 'dismissed', 'committed']),
  titleKey: z
    .string()
    .regex(/^(movie|tv|person):\d+$/)
    .optional(),
  metadata: z
    .record(z.string(), z.unknown())
    .optional()
    .refine((m) => !m || JSON.stringify(m).length <= MAX_METADATA_CHARS, {
      message: 'metadata too large',
    }),
});

const recordSchema = z.object({
  sessionId: z.string().min(8).max(64),
  events: z.array(eventSchema).min(1).max(20),
});

/**
 * Appends client-reported For You events for the signed-in user. Validated
 * and size-capped; best-effort (a failed insert is logged and swallowed —
 * analytics must never break the page).
 */
export async function recordForYouEvents(
  userId: string,
  input: unknown,
): Promise<{ recorded: number }> {
  const parsed = recordSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationAppError('Invalid For You events', parsed.error.flatten());
  }
  const { sessionId, events } = parsed.data;
  try {
    await db.insert(forYouEvents).values(
      events.map((e) => ({
        userId,
        sessionId,
        event: e.event,
        titleKey: e.titleKey ?? null,
        metadata: e.metadata ?? null,
      })),
    );
    return { recorded: events.length };
  } catch (err) {
    logger.warn('Failed to record For You events', { count: events.length, err });
    return { recorded: 0 };
  }
}
