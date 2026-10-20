'use client';

import { trackProfile } from './profileEvents';

/** Fired by the notifications page once it has marked rows read, so the bell re-counts. */
export const NOTIFICATIONS_READ_EVENT = 'watchly:notifications-read';

type NotificationsEvent = 'notifications_viewed' | 'notification_opened' | 'follow_request_answered';

/** Notification analytics ride on profile events, filed under the viewer's own profile. */
export function trackNotifications(viewerId: string, event: NotificationsEvent, metadata: Record<string, unknown>) {
  trackProfile(viewerId, event, undefined, metadata);
}
