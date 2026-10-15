import 'server-only';

import { unstable_cache, updateTag } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { userProfiles } from '@/db/schema';
import { ACCENT_SLUGS, type AccentSlug } from '@/constants/accentColors';

const ACCENT_TAG = (userId: string) => `profile-accent:${userId}`;
const ACCENT_REVALIDATE_SECONDS = 60 * 60; // 1h — accent rarely changes

function asAccentSlug(v: string | null | undefined): AccentSlug | null {
  return v && (ACCENT_SLUGS as readonly string[]).includes(v)
    ? (v as AccentSlug)
    : null;
}

/**
 * Cached accent-color lookup. Called from `(authed)` + `(public)` layouts
 * on every navigation; without the cache each page transition costs a
 * round-trip to fetch a value that changes at most a few times per user
 * per year. We invalidate the per-user tag from `updateProfileAction` /
 * `updatePrivacyAction` so picker changes still apply on the next paint.
 */
export async function getAccentColorFor(
  userId: string,
): Promise<AccentSlug | null> {
  const cached = unstable_cache(
    async (uid: string) => {
      const [row] = await db
        .select({ accentColor: userProfiles.accentColor })
        .from(userProfiles)
        .where(eq(userProfiles.userId, uid))
        .limit(1);
      return row?.accentColor ?? null;
    },
    ['profile-accent', userId],
    { revalidate: ACCENT_REVALIDATE_SECONDS, tags: [ACCENT_TAG(userId)] },
  );

  const raw = await cached(userId);
  return asAccentSlug(raw);
}

/**
 * Bust the cache after a profile edit so the new accent applies on the
 * next navigation. Uses Next 16's `updateTag` (no profile arg, intended
 * for use inside Server Actions where we already have read-your-own-
 * writes semantics).
 */
export function invalidateAccentColorFor(userId: string): void {
  updateTag(ACCENT_TAG(userId));
}
