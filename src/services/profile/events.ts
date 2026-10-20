import 'server-only';

import { z } from 'zod';
import { db } from '@/db';
import { profileEvents } from '@/db/schema';
import { logger } from '@/lib/log';
import { ValidationAppError } from '@/utils/errors';

const MAX_METADATA_CHARS = 2000;

const eventSchema = z.object({
  event: z.enum(['profile_viewed', 'section_opened', 'title_opened', 'follow', 'share', 'watched_date_edited', 'watched_removed', 'watched_logged', 'watched_backfilled']),
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
  profileUserId: z.string().uuid(),
  events: z.array(eventSchema).min(1).max(20),
});

type ViewerKind = 'self' | 'follower' | 'stranger' | 'guest';

/**
 * Appends profile events. The viewer kind (self / follower / stranger /
 * guest) is derived server-side — never trusted from the client — and
 * stamped into each event's metadata. Best-effort: failures are logged and
 * swallowed.
 */
export async function recordProfileEvents(
  viewerId: string | null,
  input: unknown,
): Promise<{ recorded: number }> {
  const parsed = recordSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationAppError('Invalid profile events', parsed.error.flatten());
  }
  const { sessionId, profileUserId, events } = parsed.data;

  try {
    let viewer: ViewerKind = 'guest';
    if (viewerId === profileUserId) viewer = 'self';
    else if (viewerId) {
      const { getFollowState } = await import('@/services/social');
      const state = await getFollowState(viewerId, profileUserId);
      viewer = state.status === 'accepted' ? 'follower' : 'stranger';
    }

    await db.insert(profileEvents).values(
      events.map((e) => ({
        userId: viewerId,
        profileUserId,
        sessionId,
        event: e.event,
        titleKey: e.titleKey ?? null,
        metadata: { ...(e.metadata ?? {}), viewer },
      })),
    );
    return { recorded: events.length };
  } catch (err) {
    logger.warn('Failed to record profile events', { count: events.length, err });
    return { recorded: 0 };
  }
}
