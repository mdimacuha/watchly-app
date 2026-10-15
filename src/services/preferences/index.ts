import { db } from '@/db';
import { userPreferences } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { ValidationAppError } from '@/utils/errors';
import { recordActivity } from '@/services/activity/record';
import { getCountryName } from '@/lib/regions/countries';
import { getUserPreferencesRow } from '@/services/users/rows';
import {
  updateRegionSchema,
  type UpdateRegionInput,
} from './validators';

/**
 * Updates (or creates) the user's region preference.
 * Returns the full user_preferences row.
 */
export async function updateRegion(userId: string, input: UpdateRegionInput) {
  const parsed = updateRegionSchema.safeParse(input);

  if (!parsed.success) {
    throw new ValidationAppError('Invalid region input', parsed.error.flatten());
  }

  const { regionCode, regionSource } = parsed.data;

  const existing = await db.query.userPreferences.findFirst({
    where: eq(userPreferences.userId, userId),
  });

  let result;
  let changed = false;

  if (existing) {
    changed = existing.regionCode !== regionCode;
    const [updated] = await db
      .update(userPreferences)
      .set({ regionCode, regionSource, updatedAt: new Date() })
      .where(eq(userPreferences.userId, userId))
      .returning();
    result = updated;
  } else {
    changed = true;
    const [created] = await db
      .insert(userPreferences)
      .values({ userId, regionCode, regionSource })
      .returning();
    result = created;
  }

  // System event — no actor.
  if (changed) {
    await recordActivity(
      userId,
      {
        type: 'region_update',
        payload: { regionName: getCountryName(regionCode) ?? regionCode },
      },
      { actorId: null },
    );
  }

  return result;
}

/**
 * Gets the user's region preference.
 * Returns null if not set.
 */
export async function getUserRegion(userId: string) {
  // Cached accessor so this shares the single user_preferences read with
  // getProfileWithStats within the same request (e.g. the /me page).
  const prefs = await getUserPreferencesRow(userId);

  return prefs?.regionCode ?? null;
}

export type ThemePreference = 'system' | 'dark' | 'light';

/**
 * Gets the user's theme preference. Returns null if the user has never
 * explicitly chosen one (the UI should fall back to 'system').
 */
export async function getUserTheme(
  userId: string,
): Promise<ThemePreference | null> {
  const prefs = await db.query.userPreferences.findFirst({
    where: eq(userPreferences.userId, userId),
    columns: { theme: true },
  });
  const raw = prefs?.theme ?? null;
  if (raw === 'dark' || raw === 'light' || raw === 'system') return raw;
  return null;
}
