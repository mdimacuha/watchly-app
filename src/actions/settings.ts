'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { getSession } from '@/server/auth/session';
import { AppError, UnauthorizedAppError, ValidationAppError } from '@/utils/errors';
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
  revalidatePath('/settings');
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
  revalidatePath('/settings');
  revalidatePath('/me');
}

export async function changePasswordAction(input: ChangePasswordInput) {
  const userId = await requireUserId();
  const cookieStore = await cookies();
  const currentSessionToken = cookieStore.get(SESSION_COOKIE)?.value;
  await changePassword(userId, input, currentSessionToken);
  revalidatePath('/settings');
}

export async function deleteAccountAction(input: DeleteAccountInput) {
  const userId = await requireUserId();
  await deleteAccount(userId, input);
  await clearSessionCookie();
  await clearThemeCookie();
}

// ---------------------------------------------------------------------------
// Settings revamp: snapshot, visitor preview, sessions, blocked users
// ---------------------------------------------------------------------------

export type SettingsActionResult = { ok: true } | { ok: false; error: string };

async function runSettings(fn: (userId: string) => Promise<unknown>): Promise<SettingsActionResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: 'Please sign in again.' };
  try {
    await fn(session.userId);
    return { ok: true };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: err.message };
    console.error('Settings action failed:', err);
    return { ok: false, error: 'Something went wrong. Please try again.' };
  }
}

/** Fresh "what visitors see" after a privacy change. */
export async function getVisitorPreviewAction() {
  const userId = await requireUserId();
  const { getVisitorPreview } = await import('@/services/profile/visitorPreview');
  return getVisitorPreview(userId);
}

export async function revokeSessionAction(sessionId: string): Promise<SettingsActionResult> {
  const { revokeSession } = await import('@/services/settings/sessions');
  const token = (await cookies()).get(SESSION_COOKIE)?.value ?? null;
  return runSettings((userId) => revokeSession(userId, sessionId, token));
}

export async function revokeOtherSessionsAction(): Promise<SettingsActionResult> {
  const { revokeOtherSessions } = await import('@/services/settings/sessions');
  const token = (await cookies()).get(SESSION_COOKIE)?.value ?? null;
  return runSettings((userId) => revokeOtherSessions(userId, token));
}

export async function unblockUserAction(blockedId: string): Promise<SettingsActionResult> {
  const { unblockUser } = await import('@/services/social');
  return runSettings(async (userId) => {
    if (typeof blockedId !== 'string' || !/^[0-9a-f-]{36}$/i.test(blockedId)) {
      throw new ValidationAppError('Invalid user');
    }
    await unblockUser(userId, blockedId);
  });
}
