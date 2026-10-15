import { z } from 'zod';
import { ACCENT_SLUGS } from '@/constants/accentColors';

export const accentColorSchema = z.enum(ACCENT_SLUGS).nullable();

export const updateProfileSchema = z.object({
  displayName: z.string().min(1).max(50),
  bio: z.string().max(160).optional(),
  avatarUrl: z.string().url().optional().or(z.literal('')),
  accentColor: accentColorSchema.optional(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
