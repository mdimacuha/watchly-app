import { z } from 'zod';

/** Alerts one user can hold at once. */
export const ALERTS_PER_USER_MAX = 200;

export const alertTitleSchema = z.object({
  mediaType: z.enum(['movie', 'tv']),
  mediaId: z.string().regex(/^\d+$/, 'Invalid title id'),
});

export const setTitleAlertSchema = alertTitleSchema.extend({
  region: z.string().regex(/^[A-Z]{2}$/, 'Invalid region'),
  streaming: z.boolean(),
  leaving: z.boolean(),
  newSeason: z.boolean(),
});

export type AlertTitleInput = z.infer<typeof alertTitleSchema>;
export type SetTitleAlertInput = z.infer<typeof setTitleAlertSchema>;
