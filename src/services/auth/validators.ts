import { z } from 'zod';

export const signUpSchema = z.object({
  // 254 is the RFC-practical upper bound. Trim + lowercase BEFORE the
  // .email() check so user-pasted whitespace doesn't fail spuriously.
  email: z
    .string()
    .transform((v) => v.trim().toLowerCase())
    .pipe(z.string().email('Invalid email address').max(254, 'Email is too long')),
  // Loose at the schema layer — strict format check + reserved /
  // moderation lookups happen in validateUsername() inside the signup
  // service. Single rejection message instead of a regex jumble.
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(24, 'Username must be at most 24 characters')
    .transform((v) => v.trim().toLowerCase()),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password must be at most 72 characters'),
  firstName: z
    .string()
    .min(1, 'First name is required')
    .max(50)
    .transform((v) => v.trim()),
  lastName: z
    .string()
    .min(1, 'Last name is required')
    .max(50)
    .transform((v) => v.trim()),
});

export type SignUpInput = z.infer<typeof signUpSchema>;

export const signInSchema = z.object({
  identifier: z
    .string()
    .min(1, 'Email or username is required')
    .transform((v) => v.trim().toLowerCase()),
  password: z
    .string()
    .min(1, 'Password is required'),
  // "Remember me". Defaults to false for programmatic/absent callers so the
  // conservative (shorter) session is chosen unless persistence is opted into.
  // Drives BOTH the DB session TTL and the cookie persistence in the signin
  // service so the two stay in sync.
  rememberMe: z.boolean().optional().default(false),
});

export type SignInInput = z.infer<typeof signInSchema>;
