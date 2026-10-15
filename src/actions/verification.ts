'use server';

import { getSession } from '@/server/auth/session';
import { UnauthorizedAppError } from '@/utils/errors';
import {
  getVerificationStatus,
  type VerificationStatus,
} from '@/services/auth/verificationGate';

export async function getVerificationStatusAction(): Promise<VerificationStatus | null> {
  const session = await getSession();
  if (!session) return null;
  return getVerificationStatus(session.userId);
}
