import { create } from 'zustand';
import type { AuthUser, AuthStatus } from '@/types/auth';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

interface AuthActions {
  /** Populate store after a successful /api/me response. */
  setAuthenticated: (user: AuthUser) => void;
  /** Mark the user as not signed in. */
  setUnauthenticated: () => void;
  /** Alias for setUnauthenticated — use on logout for semantic clarity. */
  clear: () => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useAuthStore = create<AuthState & AuthActions>((set) => ({
  status: 'unknown',
  user: null,

  setAuthenticated: (user) => set({ status: 'authenticated', user }),
  setUnauthenticated: () => set({ status: 'unauthenticated', user: null }),
  clear: () => set({ status: 'unauthenticated', user: null }),
}));
