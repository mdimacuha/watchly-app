'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '@/server/auth/session';
import { UnauthorizedAppError } from '@/utils/errors';
import {
  getNotificationPreferences,
  updateNotificationPreferences,
  type NotificationPrefs,
  type ResolvedNotificationPrefs,
} from '@/services/notifications/preferences';

export async function getNotificationPreferencesAction(): Promise<ResolvedNotificationPrefs> {
  const session = await getSession();
  if (!session) throw new UnauthorizedAppError();
  return getNotificationPreferences(session.userId);
}

export async function updateNotificationPreferencesAction(
  input: NotificationPrefs,
): Promise<ResolvedNotificationPrefs> {
  const session = await getSession();
  if (!session) throw new UnauthorizedAppError();
  const next = await updateNotificationPreferences(session.userId, input);
  revalidatePath('/settings/notifications');
  return next;
}
