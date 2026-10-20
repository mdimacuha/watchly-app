import 'server-only';

import { z } from 'zod';
import { db } from '@/db';
import { userPreferences } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { ValidationAppError } from '@/utils/errors';
import { invalidateForYouPool } from '@/services/forYou/cacheTag';

export const selectedProvidersSchema = z.array(z.number().int().positive()).max(50);

export type SelectedProviders = z.infer<typeof selectedProvidersSchema>;

/**
 * Returns the user's For You provider filter, or null when none is set
 * (meaning: don't apply any provider filtering — fall back to
 * "any provider in my region").
 */
export async function getSelectedProviders(
  userId: string,
): Promise<SelectedProviders | null> {
  const row = await db.query.userPreferences.findFirst({
    where: eq(userPreferences.userId, userId),
    columns: { selectedProviders: true },
  });
  const raw = row?.selectedProviders;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  // Validate defensively — DB stores arbitrary jsonb so a malformed row
  // shouldn't crash the For You feed.
  const parsed = selectedProvidersSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export async function updateSelectedProviders(
  userId: string,
  next: SelectedProviders,
): Promise<SelectedProviders> {
  const parsed = selectedProvidersSchema.safeParse(next);
  if (!parsed.success) {
    throw new ValidationAppError(
      'Invalid selected providers',
      parsed.error.flatten(),
    );
  }
  await db
    .update(userPreferences)
    .set({ selectedProviders: parsed.data, updatedAt: new Date() })
    .where(eq(userPreferences.userId, userId));
  invalidateForYouPool(userId, { library: false });
  return parsed.data;
}
