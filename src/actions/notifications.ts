'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '@/server/auth/session';
import { UnauthorizedAppError } from '@/utils/errors';
import {
  getNotifications,
  getUnreadNotificationCount,
  markAllNotificationsRead,
  type NotificationsPayload,
} from '@/services/notifications';

export async function getNotificationsAction(
  opts: { before?: string } = {},
): Promise<NotificationsPayload> {
  const session = await getSession();
  if (!session) throw new UnauthorizedAppError();
  return getNotifications(session.userId, opts);
}

export async function getUnreadNotificationCountAction(): Promise<number> {
  const session = await getSession();
  if (!session) return 0;
  return getUnreadNotificationCount(session.userId);
}

export async function markAllNotificationsReadAction(): Promise<void> {
  const session = await getSession();
  if (!session) throw new UnauthorizedAppError();
  await markAllNotificationsRead(session.userId);
  revalidatePath('/notifications');
}
