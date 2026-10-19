import { z } from 'zod';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { userFavorites, userProfiles, watchlistItems, watchlists } from '@/db/schema';
import { mapWithConcurrency } from '@/lib/concurrency';
import { ValidationAppError } from '@/utils/errors';
import { loadTitle, type InsightTitle } from './insights';

// The profile's Feature presentation, picked by the owner: up to 6 titles
// from their own favorites and watchlists, in order. An empty pick list
// means the automatic ranking (profileModel.rankedFavorites).

export const FEATURED_MAX = 6;
/** Picker candidates, newest first; keeps the TMDB fan-out bounded. */
const CANDIDATES_MAX = 150;

type FeaturedRef = { mediaType: 'movie' | 'tv'; mediaId: string };

const featuredSchema = z
  .array(z.object({ mediaType: z.enum(['movie', 'tv']), mediaId: z.string().regex(/^\d+$/) }))
  .max(FEATURED_MAX, `Pick up to ${FEATURED_MAX} titles`)
  .refine((list) => new Set(list.map((t) => `${t.mediaType}:${t.mediaId}`)).size === list.length, 'Each title can be picked once');

const keyOf = (t: { mediaType: string; mediaId: string }) => `${t.mediaType}:${t.mediaId}`;

/** The owner's picks as display titles (titles TMDB can't resolve are dropped). */
export async function getFeaturedTitles(userId: string): Promise<InsightTitle[]> {
  const [row] = await db
    .select({ featured: userProfiles.featuredTitles })
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1);
  const refs = row?.featured ?? [];
  if (refs.length === 0) return [];
  const titles = await mapWithConcurrency(refs, 6, (r) => loadTitle(r.mediaType, r.mediaId));
  return titles.filter((t): t is InsightTitle => t !== null);
}

export interface FeatureCandidate extends InsightTitle {
  /** Where it comes from: "Favorite" and/or list names. */
  sources: string[];
}

/** Everything the owner may feature: movie/TV favorites + titles on their watchlists. */
export async function getFeatureCandidates(userId: string): Promise<FeatureCandidate[]> {
  const [favs, items] = await Promise.all([
    db
      .select({ mediaType: userFavorites.favoriteType, mediaId: userFavorites.favoriteId })
      .from(userFavorites)
      .where(and(eq(userFavorites.userId, userId), inArray(userFavorites.favoriteType, ['movie', 'tv'])))
      .orderBy(desc(userFavorites.createdAt)),
    db
      .select({ mediaType: watchlistItems.mediaType, mediaId: watchlistItems.mediaId, listName: watchlists.name })
      .from(watchlistItems)
      .innerJoin(watchlists, eq(watchlists.id, watchlistItems.watchlistId))
      .where(eq(watchlists.userId, userId))
      .orderBy(desc(watchlistItems.createdAt)),
  ]);

  const sources = new Map<string, { ref: FeaturedRef; sources: string[] }>();
  const add = (ref: FeaturedRef, source: string) => {
    const k = keyOf(ref);
    const entry = sources.get(k) ?? { ref, sources: [] };
    if (!entry.sources.includes(source)) entry.sources.push(source);
    sources.set(k, entry);
  };
  for (const f of favs) add({ mediaType: f.mediaType as 'movie' | 'tv', mediaId: f.mediaId }, 'Favorite');
  for (const i of items) add({ mediaType: i.mediaType, mediaId: i.mediaId }, i.listName);

  const entries = [...sources.values()].slice(0, CANDIDATES_MAX);
  const titles = await mapWithConcurrency(entries, 8, (e) => loadTitle(e.ref.mediaType, e.ref.mediaId));
  return entries
    .map((e, i) => (titles[i] ? { ...titles[i]!, sources: e.sources } : null))
    .filter((c): c is FeatureCandidate => c !== null);
}

/** Save the picks (order = display order). Each must be one of the owner's favorites or list items. */
export async function setFeaturedTitles(userId: string, input: unknown): Promise<void> {
  const parsed = featuredSchema.safeParse(input);
  if (!parsed.success) throw new ValidationAppError(parsed.error.issues[0]?.message ?? 'Invalid picks');
  const picks = parsed.data;

  if (picks.length > 0) {
    const ids = picks.map((p) => p.mediaId);
    const [favs, items] = await Promise.all([
      db
        .select({ mediaType: userFavorites.favoriteType, mediaId: userFavorites.favoriteId })
        .from(userFavorites)
        .where(and(eq(userFavorites.userId, userId), inArray(userFavorites.favoriteId, ids))),
      db
        .select({ mediaType: watchlistItems.mediaType, mediaId: watchlistItems.mediaId })
        .from(watchlistItems)
        .innerJoin(watchlists, eq(watchlists.id, watchlistItems.watchlistId))
        .where(and(eq(watchlists.userId, userId), inArray(watchlistItems.mediaId, ids))),
    ]);
    const owned = new Set([...favs, ...items].map((r) => keyOf(r)));
    if (picks.some((p) => !owned.has(keyOf(p)))) {
      throw new ValidationAppError('Pick from your favorites and watchlists');
    }
  }

  await db.update(userProfiles).set({ featuredTitles: picks, updatedAt: new Date() }).where(eq(userProfiles.userId, userId));
}
