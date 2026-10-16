'use client';

import { createEventTracker } from './eventTracker';

/** For You analytics (see for_you_events in db/schema.ts). */

export type ForYouEventKind =
  | 'feed_viewed'
  | 'title_opened'
  | 'spin'
  | 'filter_changed'
  | 'dismissed'
  | 'committed';

const track = createEventTracker<{
  event: ForYouEventKind;
  titleKey?: string;
  metadata?: Record<string, unknown>;
}>('/api/me/for-you/events');

/** `titleKey` is "movie:123" / "tv:456" when the event is about a title. */
export function trackForYou(
  event: ForYouEventKind,
  titleKey?: string,
  metadata?: Record<string, unknown>,
) {
  track({ event, titleKey, metadata });
}
