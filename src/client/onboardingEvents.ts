'use client';

import { createEventTracker } from './eventTracker';

/** First-run funnel analytics (see onboarding_events in db/schema.ts). */

export type OnboardingClientEvent =
  | 'taste_viewed'
  | 'taste_picked'
  | 'taste_searched'
  | 'ticket_rerolled'
  | 'ticket_opened';

const track = createEventTracker<{ event: OnboardingClientEvent; metadata?: Record<string, unknown> }>('/api/v1/onboarding/events');

export function trackOnboarding(event: OnboardingClientEvent, metadata?: Record<string, unknown>) {
  track({ event, metadata });
}

// Where a guest arrived from (gowatchly.com buttons add these to /signup).
// Signup claims the guest's events, so this attributes finished signups too.
const SOURCE_PARAMS = ['ref', 'placement', 'utm_source', 'utm_medium', 'utm_campaign'] as const;

/** The arrival's ref/placement/UTM tags from the URL; short slugs only. */
export function arrivalSource(): Record<string, string> | undefined {
  const params = new URLSearchParams(window.location.search);
  const source: Record<string, string> = {};
  for (const key of SOURCE_PARAMS) {
    const value = params.get(key);
    if (value && /^[\w.-]{1,64}$/.test(value)) source[key] = value;
  }
  return Object.keys(source).length ? source : undefined;
}
