'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { userProfiles } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getSession } from '@/server/auth/session';
import { UnauthorizedAppError } from '@/utils/errors';

export async function setBannerEnabledAction(enabled: boolean): Promise<void> {
  const session = await getSession();
  if (!session) throw new UnauthorizedAppError();
  await db
    .update(userProfiles)
    .set({ bannerEnabled: enabled, updatedAt: new Date() })
    .where(eq(userProfiles.userId, session.userId));
  revalidatePath('/me');
  revalidatePath('/settings');
}
