import type { AccentSlug } from '@/constants/accentColors';

/**
 * Safe-for-client user shape — no secrets, no password fields.
 * Used by the Zustand auth store and the GET /api/me response.
 */
export type AuthUser = {
  id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl: string;
  /**
   * The user's accent-color slug (or null for the default). Surfaced here so
   * the public shell can apply the accent client-side without a server session
   * read — see PublicShell / AccentScope. Optional so other AuthUser producers
   * needn't supply it.
   */
  accentColor?: AccentSlug | null;
};

export type AuthStatus = 'unknown' | 'authenticated' | 'unauthenticated';
