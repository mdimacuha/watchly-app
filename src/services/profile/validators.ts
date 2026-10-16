import { z } from 'zod';
import { ACCENT_SLUGS } from '@/constants/accentColors';
import { CARD_FEATURE_LABEL_SLUGS, CARD_FEATURE_MODES } from '@/constants/cardFeature';

export const accentColorSchema = z.enum(ACCENT_SLUGS).nullable();

/** Profile card highlight. `custom` must name a title + a label preset. */
export const cardFeatureSchema = z
  .object({
    mode: z.enum(CARD_FEATURE_MODES),
    mediaType: z.enum(['movie', 'tv']).nullable().optional(),
    mediaId: z.string().regex(/^\d+$/).nullable().optional(),
    label: z.enum(CARD_FEATURE_LABEL_SLUGS).nullable().optional(),
  })
  .refine((v) => v.mode !== 'custom' || (v.mediaType && v.mediaId && v.label), {
    message: 'Pick a favorite and a label for your card',
  });

export const updateProfileSchema = z.object({
  displayName: z.string().min(1).max(50),
  bio: z.string().max(160).optional(),
  avatarUrl: z.string().url().optional().or(z.literal('')),
  accentColor: accentColorSchema.optional(),
  cardFeature: cardFeatureSchema.optional(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
