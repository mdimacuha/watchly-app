import 'server-only';

import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { titleSwipes, userPreferences, userProfiles, users } from '@/db/schema';
import { logger } from '@/lib/log';
import { recordSwipe } from '@/services/swipe';
import { getLoggedEvents } from './events';
import type { TastePick } from './validators';
import type { TasteTitle } from './titles';

/** The first run's entries, in order. `taste` and `account` happen on /signup. */
export const FIRST_NIGHT_STEPS = ['taste', 'account', 'region', 'services', 'profile', 'ticket'] as const;
export type FirstNightStep = (typeof FIRST_NIGHT_STEPS)[number];

export interface OnboardingState {
  completed: boolean;
  /** The first entry not answered yet: where the sheet opens. */
  resumeAt: FirstNightStep;
  picks: TasteTitle[];
  username: string;
  email: string;
  regionCode: string | null;
  regionSource: 'ip' | 'manual' | 'unknown';
  selectedProviders: number[];
  displayName: string;
  firstName: string;
  lastName: string;
  bio: string;
  avatarUrl: string;
}

/**
 * Saves the guest's taste picks as likes (source 'onboarding'), never as
 * Favorites: Favorites are curated and public, these are seeds for For You.
 * Each like is its own upsert, so a retry can't double-count; one bad pick
 * never blocks the rest.
 */
export async function seedTastePicks(userId: string, picks: TastePick[]): Promise<number> {
  let saved = 0;
  for (const p of picks) {
    try {
      await recordSwipe({
        userId,
        tmdbId: p.id,
        mediaType: p.mediaType,
        action: 'liked',
        source: 'onboarding',
        metadata: { title: p.title, year: p.year ?? null, poster: p.poster ?? null },
      });
      saved++;
    } catch (err) {
      logger.warn('[onboarding] taste pick not saved', { mediaType: p.mediaType, err });
    }
  }
  return saved;
}

function asPick(row: { titleId: string; titleType: string; metadata: unknown }): TasteTitle | null {
  const id = Number(row.titleId);
  if (!Number.isFinite(id) || (row.titleType !== 'movie' && row.titleType !== 'tv')) return null;
  const m = (row.metadata ?? {}) as { title?: unknown; year?: unknown; poster?: unknown };
  return {
    key: `${row.titleType}:${id}`,
    mediaType: row.titleType,
    id,
    title: typeof m.title === 'string' ? m.title : 'Untitled',
    year: typeof m.year === 'string' ? m.year : null,
    poster: typeof m.poster === 'string' ? m.poster : null,
  };
}

/**
 * Where a signed-in person is in the first run, worked out from what they've
 * answered: a confirmed region, then the services and name steps (which can
 * be skipped, so their logged events are the marker). Nothing stores a step.
 */
export async function getOnboardingState(userId: string): Promise<OnboardingState | null> {
  const [user, prefs, profile, likes, marks] = await Promise.all([
    db.query.users.findFirst({ where: eq(users.id, userId), columns: { username: true, email: true, firstName: true, lastName: true } }),
    db.query.userPreferences.findFirst({
      where: eq(userPreferences.userId, userId),
      columns: { regionCode: true, regionSource: true, selectedProviders: true, onboardingCompleted: true },
    }),
    db.query.userProfiles.findFirst({
      where: eq(userProfiles.userId, userId),
      columns: { displayName: true, bio: true, avatarUrl: true },
    }),
    db
      .select({ titleId: titleSwipes.titleId, titleType: titleSwipes.titleType, metadata: titleSwipes.metadata })
      .from(titleSwipes)
      .where(and(eq(titleSwipes.userId, userId), eq(titleSwipes.source, 'onboarding'), eq(titleSwipes.action, 'liked')))
      .orderBy(desc(titleSwipes.createdAt))
      .limit(10),
    getLoggedEvents(userId, ['services_saved', 'services_skipped', 'profile_saved', 'profile_skipped']),
  ]);
  if (!user || !prefs) return null;

  const regionDone = prefs.regionSource !== 'unknown' && prefs.regionCode !== 'unknown';
  const servicesDone = marks.has('services_saved') || marks.has('services_skipped');
  const profileDone = marks.has('profile_saved') || marks.has('profile_skipped');
  const resumeAt: FirstNightStep = !regionDone ? 'region' : !servicesDone ? 'services' : !profileDone ? 'profile' : 'ticket';
  const providers = Array.isArray(prefs.selectedProviders) ? prefs.selectedProviders.filter((n): n is number => typeof n === 'number') : [];

  return {
    completed: prefs.onboardingCompleted,
    resumeAt,
    picks: likes.map(asPick).filter((p): p is TasteTitle => p !== null).reverse(),
    username: user.username,
    email: user.email,
    regionCode: regionDone ? prefs.regionCode : null,
    regionSource: prefs.regionSource,
    selectedProviders: providers,
    displayName: profile?.displayName || user.username,
    // Signup stores the username as first_name (the column is NOT NULL):
    // that placeholder isn't a real name, so don't prefill it.
    firstName: user.firstName === user.username ? '' : user.firstName,
    lastName: user.lastName,
    bio: profile?.bio ?? '',
    avatarUrl: profile?.avatarUrl ?? '',
  };
}

export async function isOnboardingCompleted(userId: string): Promise<boolean> {
  const row = await db.query.userPreferences.findFirst({
    where: eq(userPreferences.userId, userId),
    columns: { onboardingCompleted: true },
  });
  // No preferences row = nothing to send them back to.
  return row?.onboardingCompleted ?? true;
}

/** Marks the first run done (on the ticket reveal). Idempotent. */
export async function completeOnboarding(userId: string): Promise<void> {
  await db
    .update(userPreferences)
    .set({ onboardingCompleted: true, onboardingCompletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(userPreferences.userId, userId), eq(userPreferences.onboardingCompleted, false)));
}
