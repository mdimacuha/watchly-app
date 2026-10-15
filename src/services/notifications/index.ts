import 'server-only';

import { db } from '@/db';
import { notifications } from '@/db/schema';
import { shouldDeliverToUser } from './preferences';

// Re-export the read API (which lives in getNotifications.ts so the
// enrichment logic can be tested + tree-shaken independently).
export {
  getNotifications,
  getUnreadNotificationCount,
  markAllNotificationsRead,
  type NotificationItem,
  type NotificationsPayload,
  type NotificationActor,
} from './getNotifications';

export {
  getNotificationPreferences,
  updateNotificationPreferences,
  shouldDeliverToUser,
  type NotificationPrefs,
  type ResolvedNotificationPrefs,
} from './preferences';

export type NotificationType =
  | 'follow_request'
  | 'follow_accepted'
  | 'follow_back'
  | 'follow_activity';

export type Notification = typeof notifications.$inferSelect;

interface CreateInput {
  userId: string;
  actorId: string | null;
  type: NotificationType;
  payload?: Record<string, unknown>;
}

/**
 * Insert one notification row. Used by social + activity services. By
 * convention, every notification site wraps this in a try/catch so a
 * notification failure never breaks the primary action.
 */
export async function createNotification(
  input: CreateInput,
): Promise<Notification | null> {
  // Per-type opt-out check. Returns null when the recipient has muted
  // this category so callers can branch (most just ignore the return).
  const allowed = await shouldDeliverToUser(input.userId, input.type);
  if (!allowed) return null;

  const [row] = await db
    .insert(notifications)
    .values({
      userId: input.userId,
      actorId: input.actorId,
      type: input.type,
      payload: input.payload ?? {},
    })
    .returning();

  return row;
}
