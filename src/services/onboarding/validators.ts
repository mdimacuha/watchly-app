import { z } from 'zod';

export const MAX_TASTE_PICKS = 5;

/**
 * A taste pick as the guest's browser sends it with signup. The title and
 * poster are kept only as display metadata on the like (so onboarding can
 * show what was picked without a TMDB call); the poster must be a TMDB image.
 */
export const tastePickSchema = z.object({
  mediaType: z.enum(['movie', 'tv']),
  id: z.number().int().positive(),
  title: z.string().trim().min(1).max(200),
  year: z.string().regex(/^\d{4}$/).nullable().optional(),
  poster: z
    .string()
    .url()
    .max(300)
    .refine((u) => u.startsWith('https://image.tmdb.org/'), 'Not a TMDB image')
    .nullable()
    .optional(),
});

export const tastePicksSchema = z.array(tastePickSchema).max(MAX_TASTE_PICKS);

export type TastePick = z.infer<typeof tastePickSchema>;

export const tasteSearchSchema = z.object({
  q: z.string().trim().min(1).max(80),
  region: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .nullable()
    .catch(null),
});
