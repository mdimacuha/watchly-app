import { z } from 'zod';

export const updateRegionSchema = z.object({
  regionCode: z
    .string()
    .length(2)
    .transform((val) => val.toUpperCase()),
  regionSource: z.enum(['manual', 'ip']),
});

export type UpdateRegionInput = z.infer<typeof updateRegionSchema>;
