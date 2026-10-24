import 'server-only';

import { z } from 'zod';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { onboardingEvents } from '@/db/schema';
import { logger } from '@/lib/log';
import { ValidationAppError } from '@/utils/errors';

/**
 * The first-run funnel (see onboarding_events in db/schema.ts). Guests log
 * the taste step; everything after signup is logged with the user id.
 * `services_*` and `profile_*` double as progress markers: those steps can
 * be skipped, so they leave no other trace to resume from.
 */
export const ONBOARDING_EVENT_KINDS = [
  'taste_viewed',
  'taste_picked',
  'taste_searched',
  'signup_completed',
  'region_confirmed',
  'services_saved',
  'services_skipped',
  'profile_saved',
  'profile_skipped',
  'ticket_revealed',
  'ticket_rerolled',
  'ticket_opened',
] as const;
export type OnboardingEventKind = (typeof ONBOARDING_EVENT_KINDS)[number];

const MAX_METADATA_CHARS = 2000;

const eventSchema = z.object({
  event: z.enum(ONBOARDING_EVENT_KINDS),
  metadata: z
    .record(z.string(), z.unknown())
    .optional()
    .refine((m) => !m || JSON.stringify(m).length <= MAX_METADATA_CHARS, { message: 'metadata too large' }),
});

export const recordOnboardingEventsSchema = z.object({
  // Anonymous per-tab id from the client (crypto.randomUUID()).
  sessionId: z.string().min(8).max(64),
  events: z.array(eventSchema).min(1).max(20),
});

/**
 * Appends client-reported funnel events. Public (the taste step is pre-
 * account), strictly validated and size-capped; the user id comes from the
 * session, never the client. Best-effort: analytics never break onboarding.
 */
export async function recordOnboardingEvents(userId: string | null, input: unknown): Promise<{ recorded: number }> {
  const parsed = recordOnboardingEventsSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationAppError('Invalid onboarding events', parsed.error.flatten());
  }
  const { sessionId, events } = parsed.data;
  try {
    await db.insert(onboardingEvents).values(
      events.map((e) => ({ userId, sessionId, event: e.event, metadata: e.metadata ?? null })),
    );
    return { recorded: events.length };
  } catch (err) {
    logger.warn('Failed to record onboarding events', { count: events.length, err });
    return { recorded: 0 };
  }
}

/** Server-side event (no client round trip), e.g. signup itself. */
export async function logOnboardingEvent(
  userId: string,
  sessionId: string | null,
  event: OnboardingEventKind,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    await db.insert(onboardingEvents).values({ userId, sessionId: sessionId ?? `user:${userId}`, event, metadata: metadata ?? null });
  } catch (err) {
    logger.warn('Failed to log onboarding event', { event, err });
  }
}

/** Ties a guest's taste-step events to the account they just created. */
export async function claimGuestEvents(userId: string, sessionId: string): Promise<void> {
  try {
    await db
      .update(onboardingEvents)
      .set({ userId })
      .where(and(eq(onboardingEvents.sessionId, sessionId), isNull(onboardingEvents.userId)));
  } catch (err) {
    logger.warn('Failed to claim guest onboarding events', { err });
  }
}

/** Which of the given marker events this user has logged. */
export async function getLoggedEvents(userId: string, kinds: OnboardingEventKind[]): Promise<Set<OnboardingEventKind>> {
  const rows = await db
    .selectDistinct({ event: onboardingEvents.event })
    .from(onboardingEvents)
    .where(and(eq(onboardingEvents.userId, userId), inArray(onboardingEvents.event, kinds)));
  return new Set(rows.map((r) => r.event as OnboardingEventKind));
}
