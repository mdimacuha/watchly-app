import { z } from 'zod';
import { ACCENT_SLUGS, normalizeAccentHex, type AccentColor } from '@/constants/accentColors';
import { CARD_FEATURE_LABEL_SLUGS, CARD_FEATURE_MODES } from '@/constants/cardFeature';

/** A preset slug, or a custom hex (normalized: #RRGGBB, lightness kept readable). */
export const accentColorSchema = z
  .union([
    z.enum(ACCENT_SLUGS),
    z
      .string()
      .regex(/^#?([0-9a-f]{6}|[0-9a-f]{3})$/i, 'Use a hex colour like #E4572E')
      .transform((v) => normalizeAccentHex(v) as AccentColor),
  ])
  .nullable();

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
