'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '@/server/auth/session';
import { getTitleAlert, removeTitleAlert, setTitleAlert, type TitleAlertSettings } from '@/services/alerts';
import type { AlertTitleInput, SetTitleAlertInput } from '@/services/alerts/validators';
import { AppError } from '@/utils/errors';

export type TitleAlertActionResult =
  | { ok: true; alert: TitleAlertSettings }
  | { ok: false; error: string };

/** The signed-in user's alerts on a title; null for guests. */
export async function getTitleAlertAction(input: AlertTitleInput): Promise<TitleAlertSettings | null> {
  const session = await getSession();
  if (!session) return null;
  return getTitleAlert(session.userId, input);
}

export async function setTitleAlertAction(input: SetTitleAlertInput): Promise<TitleAlertActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: 'Please sign in again.' };
  try {
    const alert = await setTitleAlert(session.userId, input);
    revalidatePath('/settings');
    return { ok: true, alert };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: err.message };
    console.error('Title alert action failed:', err);
    return { ok: false, error: 'Something went wrong. Please try again.' };
  }
}

export async function removeTitleAlertAction(input: AlertTitleInput): Promise<{ ok: boolean; error?: string }> {
  const session = await getSession();
  if (!session) return { ok: false, error: 'Please sign in again.' };
  try {
    await removeTitleAlert(session.userId, input);
    return { ok: true };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: err.message };
    console.error('Title alert removal failed:', err);
    return { ok: false, error: 'Something went wrong. Please try again.' };
  }
}
