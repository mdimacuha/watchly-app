'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '@/server/auth/session';
import { UnauthorizedAppError } from '@/utils/errors';
import {
  createApiToken,
  listApiTokens,
  revokeApiToken,
  type ApiTokenSummary,
} from '@/services/auth/apiTokens';

export async function listApiTokensAction(): Promise<ApiTokenSummary[]> {
  const session = await getSession();
  if (!session) throw new UnauthorizedAppError();
  return listApiTokens(session.userId);
}

export async function createApiTokenAction(
  name: string,
): Promise<{ token: string; summary: ApiTokenSummary }> {
  const session = await getSession();
  if (!session) throw new UnauthorizedAppError();
  const result = await createApiToken(session.userId, name);
  revalidatePath('/settings/api-tokens');
  return result;
}

export async function revokeApiTokenAction(id: string): Promise<void> {
  const session = await getSession();
  if (!session) throw new UnauthorizedAppError();
  await revokeApiToken(session.userId, id);
  revalidatePath('/settings/api-tokens');
}
