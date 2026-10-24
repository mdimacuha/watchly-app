// Needs your attention kinds, shared by the service and the page (no server-only imports).

export type AttentionKind = 'seen' | 'wait_over' | 'left' | 'on_services' | 'still_on' | 'dust';

/** Kinds that may appear in the /watchlists alert (never the quiet ones), in order. */
export const ALERT_KINDS: AttentionKind[] = ['seen', 'wait_over', 'left', 'on_services'];
