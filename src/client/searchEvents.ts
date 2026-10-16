'use client';

import { createEventTracker } from './eventTracker';

/** Search analytics (see search_events in db/schema.ts). */

type SearchEventKind =
  | 'search_performed'
  | 'result_opened'
  | 'keyword_chip_clicked'
  | 'endcap_shown';

const track = createEventTracker<{
  event: SearchEventKind;
  query?: string;
  metadata?: Record<string, unknown>;
}>('/api/v1/search/events');

export function trackSearch(
  event: SearchEventKind,
  query?: string,
  metadata?: Record<string, unknown>,
) {
  track({ event, query: query?.slice(0, 200), metadata });
}
