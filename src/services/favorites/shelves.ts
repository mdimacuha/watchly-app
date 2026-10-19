import type { z } from 'zod';
import { db } from '@/db';
import { favoriteShelfItems, favoriteShelves, userFavorites } from '@/db/schema';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { isAccentSlug, type AccentSlug } from '@/constants/accentColors';
import { NotFoundAppError, ValidationAppError } from '@/utils/errors';
import {
  SHELVES_PER_USER_MAX,
  createShelfSchema,
  setItemShelvesSchema,
  shelfItemsSchema,
  updateShelfSchema,
} from './validators';

// Favorite shelves: user-named groups of favorites, many-per-favorite.
// The UI addresses favorites by `${type}:${tmdbId}` keys; this layer maps them
// to user_favorites rows (always scoped to the caller, so a key can never
// reach another user's favorite or shelf).

export interface Shelf {
  id: string;
  name: string;
  color: AccentSlug | null;
  /** Shown on the owner's public profile (even when favorites are hidden). */
  isPublic: boolean;
  sortOrder: number;
}

export interface ShelfItem {
  shelfId: string;
  favoriteKey: string;
  sortOrder: number;
}

export interface ShelvesPayload {
  shelves: Shelf[];
  items: ShelfItem[];
}

/** The user's shelves and every shelf membership, in two queries. */
export async function listShelves(userId: string): Promise<ShelvesPayload> {
  const [shelves, items] = await Promise.all([
    db
      .select({
        id: favoriteShelves.id,
        name: favoriteShelves.name,
        color: favoriteShelves.color,
        isPublic: favoriteShelves.isPublic,
        sortOrder: favoriteShelves.sortOrder,
      })
      .from(favoriteShelves)
      .where(eq(favoriteShelves.userId, userId))
      .orderBy(asc(favoriteShelves.sortOrder), asc(favoriteShelves.createdAt)),
    db
      .select({
        shelfId: favoriteShelfItems.shelfId,
        favoriteType: userFavorites.favoriteType,
        favoriteId: userFavorites.favoriteId,
        sortOrder: favoriteShelfItems.sortOrder,
      })
      .from(favoriteShelfItems)
      .innerJoin(favoriteShelves, eq(favoriteShelves.id, favoriteShelfItems.shelfId))
      .innerJoin(userFavorites, eq(userFavorites.id, favoriteShelfItems.favoriteId))
      .where(eq(favoriteShelves.userId, userId)),
  ]);

  return {
    shelves: shelves.map((s) => ({ ...s, color: isAccentSlug(s.color) ? s.color : null })),
    items: items.map((i) => ({
      shelfId: i.shelfId,
      favoriteKey: `${i.favoriteType}:${i.favoriteId}`,
      sortOrder: i.sortOrder,
    })),
  };
}

export async function createShelf(userId: string, input: unknown): Promise<Shelf> {
  const data = parse(createShelfSchema, input);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(favoriteShelves)
    .where(eq(favoriteShelves.userId, userId));
  if (count >= SHELVES_PER_USER_MAX) {
    throw new ValidationAppError(`You can have up to ${SHELVES_PER_USER_MAX} shelves`);
  }
  await assertNameFree(userId, data.name);

  const now = new Date();
  try {
    await db.transaction(async (tx) => {
      await tx.insert(favoriteShelves).values({
        id: data.id,
        userId,
        name: data.name,
        color: data.color ?? null,
        sortOrder: count,
        createdAt: now,
        updatedAt: now,
      });
      const favoriteIds = await resolveFavoriteIds(userId, data.favoriteKeys ?? [], tx);
      if (favoriteIds.length) {
        await tx
          .insert(favoriteShelfItems)
          .values(favoriteIds.map((favoriteId, i) => ({ shelfId: data.id, favoriteId, sortOrder: i })))
          .onConflictDoNothing();
      }
    });
  } catch (err) {
    throw duplicateNameOr(err, data.name);
  }

  return { id: data.id, name: data.name, color: data.color ?? null, isPublic: false, sortOrder: count };
}

/** Rename, recolour, and/or make public or private. */
export async function updateShelf(userId: string, shelfId: string, input: unknown): Promise<void> {
  const data = parse(updateShelfSchema, input);
  await requireOwnedShelf(userId, shelfId);
  if (data.name !== undefined) await assertNameFree(userId, data.name, shelfId);
  try {
    await db
      .update(favoriteShelves)
      .set({
        ...(data.name !== undefined && { name: data.name }),
        ...(data.color !== undefined && { color: data.color }),
        ...(data.isPublic !== undefined && { isPublic: data.isPublic }),
        updatedAt: new Date(),
      })
      .where(and(eq(favoriteShelves.id, shelfId), eq(favoriteShelves.userId, userId)));
  } catch (err) {
    throw duplicateNameOr(err, data.name ?? '');
  }
}

/** Deletes the shelf and its links (cascade); the favorites stay. */
export async function deleteShelf(userId: string, shelfId: string): Promise<void> {
  await requireOwnedShelf(userId, shelfId);
  await db.delete(favoriteShelves).where(and(eq(favoriteShelves.id, shelfId), eq(favoriteShelves.userId, userId)));
}

/** Put favorites on a shelf (already-there ones are left alone). */
export async function addToShelf(userId: string, input: unknown): Promise<void> {
  const data = parse(shelfItemsSchema, input);
  await requireOwnedShelf(userId, data.shelfId);
  const favoriteIds = await resolveFavoriteIds(userId, data.favoriteKeys);
  if (!favoriteIds.length) return;
  const base = Date.now() % 1_000_000_000; // newest last, without a max() round-trip
  await db
    .insert(favoriteShelfItems)
    .values(favoriteIds.map((favoriteId, i) => ({ shelfId: data.shelfId, favoriteId, sortOrder: base + i })))
    .onConflictDoNothing();
  await touch(data.shelfId);
}

/** Take favorites off a shelf (they stay in favorites and on other shelves). */
export async function removeFromShelf(userId: string, input: unknown): Promise<void> {
  const data = parse(shelfItemsSchema, input);
  await requireOwnedShelf(userId, data.shelfId);
  const favoriteIds = await resolveFavoriteIds(userId, data.favoriteKeys);
  if (!favoriteIds.length) return;
  await db
    .delete(favoriteShelfItems)
    .where(and(eq(favoriteShelfItems.shelfId, data.shelfId), inArray(favoriteShelfItems.favoriteId, favoriteIds)));
  await touch(data.shelfId);
}

/** Set exactly which shelves one favorite is on (the card ⋯ checklist / Sort session). */
export async function setItemShelves(userId: string, input: unknown): Promise<void> {
  const data = parse(setItemShelvesSchema, input);
  const [favoriteId] = await resolveFavoriteIds(userId, [data.favoriteKey]);
  if (!favoriteId) throw new NotFoundAppError('Favorite not found');

  // Only the caller's shelves may be targeted.
  const owned = data.shelfIds.length
    ? await db
        .select({ id: favoriteShelves.id })
        .from(favoriteShelves)
        .where(and(eq(favoriteShelves.userId, userId), inArray(favoriteShelves.id, data.shelfIds)))
    : [];
  if (owned.length !== new Set(data.shelfIds).size) throw new NotFoundAppError('Shelf not found');

  const userShelfIds = db
    .select({ id: favoriteShelves.id })
    .from(favoriteShelves)
    .where(eq(favoriteShelves.userId, userId));

  await db.transaction(async (tx) => {
    await tx
      .delete(favoriteShelfItems)
      .where(and(eq(favoriteShelfItems.favoriteId, favoriteId), inArray(favoriteShelfItems.shelfId, userShelfIds)));
    if (owned.length) {
      const base = Date.now() % 1_000_000_000;
      await tx
        .insert(favoriteShelfItems)
        .values(owned.map((s) => ({ shelfId: s.id, favoriteId, sortOrder: base })))
        .onConflictDoNothing();
    }
  });
}

// ---------------------------------------------------------------------------

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const r = schema.safeParse(input);
  if (!r.success) throw new ValidationAppError(r.error.issues[0]?.message ?? 'Invalid input');
  return r.data;
}

/** user_favorites row ids for `${type}:${id}` keys, scoped to the user; unknown keys drop out. */
async function resolveFavoriteIds(userId: string, keys: string[], tx: Tx | typeof db = db): Promise<string[]> {
  if (!keys.length) return [];
  const wanted = new Set(keys);
  const types = [...new Set(keys.map((k) => k.split(':')[0]))] as ('movie' | 'tv' | 'collection' | 'artist')[];
  const ids = [...new Set(keys.map((k) => k.split(':')[1]))];
  const rows = await tx
    .select({ id: userFavorites.id, type: userFavorites.favoriteType, favoriteId: userFavorites.favoriteId })
    .from(userFavorites)
    .where(
      and(eq(userFavorites.userId, userId), inArray(userFavorites.favoriteType, types), inArray(userFavorites.favoriteId, ids)),
    );
  // Keep the caller's order.
  const byKey = new Map(rows.filter((r) => wanted.has(`${r.type}:${r.favoriteId}`)).map((r) => [`${r.type}:${r.favoriteId}`, r.id]));
  return keys.map((k) => byKey.get(k)).filter((x): x is string => !!x);
}

async function requireOwnedShelf(userId: string, shelfId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(shelfId)) throw new NotFoundAppError('Shelf not found');
  const [row] = await db
    .select({ id: favoriteShelves.id })
    .from(favoriteShelves)
    .where(and(eq(favoriteShelves.id, shelfId), eq(favoriteShelves.userId, userId)))
    .limit(1);
  if (!row) throw new NotFoundAppError('Shelf not found');
}

async function assertNameFree(userId: string, name: string, exceptShelfId?: string) {
  const [row] = await db
    .select({ id: favoriteShelves.id })
    .from(favoriteShelves)
    .where(and(eq(favoriteShelves.userId, userId), sql`lower(${favoriteShelves.name}) = lower(${name})`))
    .limit(1);
  if (row && row.id !== exceptShelfId) throw new ValidationAppError(`You already have a shelf called "${name}"`);
}

/** The unique index is the backstop for a race between two creates/renames. */
function duplicateNameOr(err: unknown, name: string): unknown {
  const code = (err as { code?: string; cause?: { code?: string } })?.code ?? (err as { cause?: { code?: string } })?.cause?.code;
  return code === '23505' ? new ValidationAppError(`You already have a shelf called "${name}"`) : err;
}

async function touch(shelfId: string) {
  await db.update(favoriteShelves).set({ updatedAt: new Date() }).where(eq(favoriteShelves.id, shelfId));
}
