'use client';

/**
 * Fire-and-forget analytics tracker shared by search and For You. Events are
 * batched briefly and POSTed in the background (sendBeacon when the tab is
 * hidden); failures are ignored — tracking must never affect the UI.
 *
 * Each tracker posts `{ sessionId, events }` to its endpoint. The session id
 * is an anonymous per-tab id shared across trackers.
 */

export interface TrackedEvent {
  event: string;
  [field: string]: unknown;
}

const FLUSH_DELAY_MS = 800;
const MAX_BATCH = 20;
const SESSION_KEY = 'watchly_session';

let memorySessionId: string | null = null;

/** Anonymous per-tab id; falls back to memory when storage is unavailable. */
export function analyticsSessionId(): string {
  try {
    const existing = sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const id = crypto.randomUUID();
    sessionStorage.setItem(SESSION_KEY, id);
    return id;
  } catch {
    memorySessionId ??= crypto.randomUUID();
    return memorySessionId;
  }
}

/**
 * `extraBody` is merged into every batch (e.g. `{ profileUserId }` for
 * profile events, whose route needs to know which profile they concern).
 */
export function createEventTracker<E extends TrackedEvent>(
  endpoint: string,
  extraBody: Record<string, unknown> = {},
) {
  const queue: E[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = (useBeacon = false) => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    while (queue.length > 0) {
      const events = queue.splice(0, MAX_BATCH);
      const body = JSON.stringify({ ...extraBody, sessionId: analyticsSessionId(), events });
      try {
        if (useBeacon && navigator.sendBeacon) {
          navigator.sendBeacon(endpoint, new Blob([body], { type: 'application/json' }));
        } else {
          void fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
            keepalive: true,
          }).catch(() => {});
        }
      } catch {
        // ignore — analytics only
      }
    }
  };

  if (typeof window !== 'undefined') {
    // Deliver anything pending when the tab is hidden or closed.
    window.addEventListener('pagehide', () => flush(true));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush(true);
    });
  }

  const track = (event: E) => {
    if (typeof window === 'undefined') return;
    queue.push(event);
    if (queue.length >= MAX_BATCH) flush();
    else if (!timer) timer = setTimeout(() => flush(), FLUSH_DELAY_MS);
  };
  /** Send what's queued now, for events added while the page is going away. */
  track.flushNow = () => flush(true);
  return track;
}
