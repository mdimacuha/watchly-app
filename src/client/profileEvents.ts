'use client';

import { createEventTracker } from './eventTracker';

/** Profile analytics (see profile_events in db/schema.ts). */

export type ProfileEventKind =
  | 'profile_viewed'
  | 'section_opened'
  | 'title_opened'
  | 'follow'
  | 'share'
  | 'watched_date_edited'
  | 'watched_removed'
  | 'watched_logged'
  | 'watched_backfilled';

// One tracker per profile so each batch carries its profileUserId.
const trackers = new Map<string, ReturnType<typeof makeTracker>>();

function makeTracker(profileUserId: string) {
  return createEventTracker<{
    event: ProfileEventKind;
    titleKey?: string;
    metadata?: Record<string, unknown>;
  }>('/api/v1/profile/events', { profileUserId });
}

export function trackProfile(
  profileUserId: string,
  event: ProfileEventKind,
  titleKey?: string,
  metadata?: Record<string, unknown>,
) {
  let track = trackers.get(profileUserId);
  if (!track) {
    track = makeTracker(profileUserId);
    trackers.set(profileUserId, track);
  }
  track({ event, titleKey, metadata });
}
