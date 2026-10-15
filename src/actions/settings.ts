'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { getSession } from '@/server/auth/session';
import { UnauthorizedAppError } from '@/utils/errors';
import {
  clearSessionCookie,
  clearThemeCookie,
  setThemeCookie,
  SESSION_COOKIE,
} from '@/utils/server/cookies';
import {
  getPrivacySettings,
  updatePrivacy,
  changeEmail,
  changePassword,
  deleteAccount,
  updateTheme,
  type UpdatePrivacyInput,
  type ChangeEmailInput,
  type ChangePasswordInput,
  type DeleteAccountInput,
  type Theme,
} from '@/services/settings';

async function requireUserId(): Promise<string> {
  const session = await getSession();
  if (!session) throw new UnauthorizedAppError();
  return session.userId;
}

export async function getPrivacyAction() {
  const userId = await requireUserId();
  return getPrivacySettings(userId);
}

export async function updatePrivacyAction(input: UpdatePrivacyInput) {
  const userId = await requireUserId();
  const row = await updatePrivacy(userId, input);
  revalidatePath('/settings/privacy');
  revalidatePath('/me');
  return row;
}

/**
 * Persist the user's theme choice. Best-effort — the ThemeProvider treats
 * the action result as advisory; localStorage remains the source of truth
 * for first-paint resolution. Returns silently on success; throws on auth
 * failure or invalid theme.
 */
export async function updateThemeAction(theme: Theme): Promise<void> {
  const userId = await requireUserId();
  await updateTheme(userId, theme);
  // Keep the cross-device cookie in sync with DB on every change so a
  // newly-signed-in device picks up the latest choice without waiting for
  // localStorage to be hydrated by an earlier session.
  await setThemeCookie(theme);
}

export async function changeEmailAction(input: ChangeEmailInput) {
  const userId = await requireUserId();
  await changeEmail(userId, input);
  revalidatePath('/settings/account');
  revalidatePath('/me');
}

export async function changePasswordAction(input: ChangePasswordInput) {
  const userId = await requireUserId();
  const cookieStore = await cookies();
  const currentSessionToken = cookieStore.get(SESSION_COOKIE)?.value;
  await changePassword(userId, input, currentSessionToken);
  revalidatePath('/settings/account');
}

export async function deleteAccountAction(input: DeleteAccountInput) {
  const userId = await requireUserId();
  await deleteAccount(userId, input);
  await clearSessionCookie();
  await clearThemeCookie();
}
