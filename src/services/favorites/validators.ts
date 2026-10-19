import { z } from 'zod';
import { ACCENT_SLUGS } from '@/constants/accentColors';

export const SHELF_NAME_MAX = 40;
export const SHELVES_PER_USER_MAX = 50;
export const SHELF_BULK_MAX = 200;

export const shelfNameSchema = z
  .string()
  .trim()
  .min(1, 'Name is required')
  .max(SHELF_NAME_MAX, `Keep it under ${SHELF_NAME_MAX} characters`);

export const shelfColorSchema = z.enum(ACCENT_SLUGS).nullable();

/** `${type}:${tmdbId}`, e.g. "movie:9552" — how the UI addresses a favorite. */
export const favoriteKeySchema = z
  .string()
  .regex(/^(movie|tv|collection|artist):\d+$/, 'Invalid favorite');

const favoriteKeysSchema = z.array(favoriteKeySchema).max(SHELF_BULK_MAX);

export const createShelfSchema = z.object({
  // Client-generated so the UI can open the new shelf immediately.
  id: z.string().uuid(),
  name: shelfNameSchema,
  color: shelfColorSchema.optional(),
  favoriteKeys: favoriteKeysSchema.optional(),
});

export const updateShelfSchema = z.object({
  name: shelfNameSchema.optional(),
  color: shelfColorSchema.optional(),
  isPublic: z.boolean().optional(),
});

export const shelfItemsSchema = z.object({
  shelfId: z.string().uuid(),
  favoriteKeys: favoriteKeysSchema.min(1),
});

export const setItemShelvesSchema = z.object({
  favoriteKey: favoriteKeySchema,
  shelfIds: z.array(z.string().uuid()).max(SHELVES_PER_USER_MAX),
});

export type CreateShelfInput = z.infer<typeof createShelfSchema>;
export type UpdateShelfInput = z.infer<typeof updateShelfSchema>;
