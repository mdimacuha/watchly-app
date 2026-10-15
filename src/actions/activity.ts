'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '@/server/auth/session';
import { UnauthorizedAppError } from '@/utils/errors';
import {
  getActivity,
  getUnreadActivityCount,
  markAllActivityRead,
} from '@/services/activity/getActivity';

export async function getActivityAction(opts?: { before?: string }) {
  const session = await getSession();
  if (!session) throw new UnauthorizedAppError();
  return getActivity(session.userId, opts);
}

export async function getUnreadActivityCountAction(): Promise<number> {
  const session = await getSession();
  if (!session) return 0;
  return getUnreadActivityCount(session.userId);
}

export async function markAllActivityReadAction() {
  const session = await getSession();
  if (!session) throw new UnauthorizedAppError();
  await markAllActivityRead(session.userId);
  revalidatePath('/activity');
  revalidatePath('/me');
}
