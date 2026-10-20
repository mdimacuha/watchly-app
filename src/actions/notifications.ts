'use server';

import { z } from 'zod';
import { getSession } from '@/server/auth/session';
import { UnauthorizedAppError } from '@/utils/errors';
import {
  getNotifications,
  getUnreadCounts,
  getUnreadNotificationCount,
  markAllNotificationsRead,
  type NotificationScope,
  type NotificationsPayload,
} from '@/services/notifications';

const scopeSchema = z.enum(['you', 'following']);
const listSchema = z.object({
  before: z.string().datetime().optional(),
  scope: scopeSchema.optional(),
});

export async function getNotificationsAction(
  opts: { before?: string; scope?: NotificationScope } = {},
): Promise<NotificationsPayload> {
  const session = await getSession();
  if (!session) throw new UnauthorizedAppError();
  return getNotifications(session.userId, listSchema.parse(opts));
}

export async function getUnreadNotificationCountAction(): Promise<number> {
  const session = await getSession();
  if (!session) return 0;
  return getUnreadNotificationCount(session.userId);
}

export async function getUnreadCountsAction(): Promise<Record<NotificationScope, number>> {
  const session = await getSession();
  if (!session) return { you: 0, following: 0 };
  return getUnreadCounts(session.userId);
}

/** Marks one tab read, or everything when no scope is given. */
export async function markAllNotificationsReadAction(scope?: NotificationScope): Promise<void> {
  const session = await getSession();
  if (!session) throw new UnauthorizedAppError();
  await markAllNotificationsRead(session.userId, scope === undefined ? undefined : scopeSchema.parse(scope));
}
