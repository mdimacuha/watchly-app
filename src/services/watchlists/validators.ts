import { z } from 'zod';

export const watchlistNameSchema = z
  .string()
  .trim()
  .min(1, 'Name is required')
  .max(80, 'Name is too long');

export const watchlistDescriptionSchema = z
  .string()
  .trim()
  .max(500, 'Description is too long')
  .default('');

export const createWatchlistSchema = z.object({
  name: watchlistNameSchema,
  description: watchlistDescriptionSchema.optional(),
  isPublic: z.boolean().optional(),
});

export type CreateWatchlistInput = z.infer<typeof createWatchlistSchema>;

export const updateWatchlistSchema = z.object({
  name: watchlistNameSchema.optional(),
  description: watchlistDescriptionSchema.optional(),
  isPublic: z.boolean().optional(),
});

export type UpdateWatchlistInput = z.infer<typeof updateWatchlistSchema>;

export const watchlistMediaTypeSchema = z.enum(['movie', 'tv']);

export type WatchlistMediaType = z.infer<typeof watchlistMediaTypeSchema>;

export const watchlistItemStatusSchema = z.enum([
  'just_added',
  'up_next',
  'watching',
  'waiting_for_episode',
  'waiting_for_season',
  'paused',
  'finished',
  'rewatch',
  'dropped',
]);

export type WatchlistItemStatus = z.infer<typeof watchlistItemStatusSchema>;

export const updateItemStatusSchema = z.object({
  itemId: z.string().uuid(),
  status: watchlistItemStatusSchema,
});

export type UpdateItemStatusInput = z.infer<typeof updateItemStatusSchema>;

// Notes: per-item free-text field. Cap matches a tweet-ish length so the card
// doesn't grow unbounded; bump later if users hit the ceiling.
export const NOTES_MAX_LENGTH = 500;

export const watchlistItemNotesSchema = z
  .string()
  .max(NOTES_MAX_LENGTH, `Notes must be ${NOTES_MAX_LENGTH} characters or less`)
  .nullable();

export const updateItemNotesSchema = z.object({
  itemId: z.string().uuid(),
  notes: watchlistItemNotesSchema,
});

export type UpdateItemNotesInput = z.infer<typeof updateItemNotesSchema>;
