'use server';

import { z } from 'zod';
import { getSession } from '@/server/auth/session';
import { UnauthorizedAppError, ValidationAppError } from '@/utils/errors';
import {
  completeOnboarding,
  logOnboardingEvent,
} from '@/services/onboarding';

const stepMarkSchema = z.object({
  event: z.enum(['region_confirmed', 'services_saved', 'services_skipped', 'profile_saved', 'profile_skipped']),
  sessionId: z.string().min(8).max(64).nullable(),
  metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
});

/**
 * Records that a first-run step was answered or skipped. Awaited by the
 * client before it moves on, because services and the name step leave no
 * other trace to resume from.
 */
export async function markOnboardingStepAction(input: z.input<typeof stepMarkSchema>): Promise<void> {
  const session = await getSession();
  if (!session) throw new UnauthorizedAppError();
  const parsed = stepMarkSchema.safeParse(input);
  if (!parsed.success) throw new ValidationAppError('Invalid step', parsed.error.flatten());
  await logOnboardingEvent(session.userId, parsed.data.sessionId, parsed.data.event, parsed.data.metadata);
}

const revealSchema = z.object({
  sessionId: z.string().min(8).max(64).nullable(),
  ticketKey: z.string().max(40).nullable(),
  source: z.enum(['pool', 'fallback']),
});

/** The reveal: marks the first run done and logs which ticket was shown. */
export async function completeOnboardingAction(input: z.input<typeof revealSchema>): Promise<void> {
  const session = await getSession();
  if (!session) throw new UnauthorizedAppError();
  const parsed = revealSchema.safeParse(input);
  if (!parsed.success) throw new ValidationAppError('Invalid reveal', parsed.error.flatten());
  await completeOnboarding(session.userId);
  await logOnboardingEvent(session.userId, parsed.data.sessionId, 'ticket_revealed', {
    ticket: parsed.data.ticketKey,
    source: parsed.data.source,
  });
}
