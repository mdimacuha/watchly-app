import { z } from 'zod';
import {
  SWIPE_ACTIONS,
  SWIPE_SOURCES,
  TITLE_TYPES,
  SWIPE_DECK_MAX_LIMIT,
} from './constants';

export const getSwipeDeckQuerySchema = z.object({
  mediaType: z.enum(['movie', 'tv', 'all']).optional(),
  region: z.string().length(2).optional(),
  limit: z.coerce.number().int().min(1).max(SWIPE_DECK_MAX_LIMIT).optional(),
  availableOnly: z.coerce.boolean().optional(),
});

export type GetSwipeDeckQuery = z.infer<typeof getSwipeDeckQuerySchema>;

export const recordSwipeSchema = z.object({
  // TMDB id is numeric at the API boundary; converted to string inside
  // the service for storage parity with userFavorites.favoriteId.
  tmdbId: z.number().int().positive(),
  mediaType: z.enum(TITLE_TYPES),
  action: z.enum(SWIPE_ACTIONS),
  source: z.enum(SWIPE_SOURCES).optional(),
  scoreSnapshot: z.number().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type RecordSwipeInput = z.infer<typeof recordSwipeSchema>;
