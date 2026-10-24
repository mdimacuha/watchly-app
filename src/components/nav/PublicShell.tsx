'use client';

import { useAuthStore } from '@/client/stores/auth';
import { AccentScope } from '@/components/profile/AccentScope';
import { AuthenticatedShell } from './AuthenticatedShell';
import { LandingNav } from '@/components/landing/LandingNav';
import { QuickViewModal } from '@/components/watchly/QuickViewModal';

/**
 * Client-side shell selector for the `(public)` route group. Replaces the
 * former server layout that did `await getSession()` (+ `getAccentColorFor`) to
 * pick chrome — a `cookies()` read in a LAYOUT, which opted the entire public
 * subtree into dynamic rendering and blocked ISR on every public page.
 *
 * Auth state is already hydrated client-side by <AuthHydrator> (GET /api/me)
 * into the Zustand auth store, so we pick the chrome from the store instead —
 * keeping the server render static and ISR-cacheable.
 *
 * Crawlers / logged-out visitors (and the brief 'unknown' window before /api/me
 * resolves) get the marketing chrome, which is exactly what belongs in the
 * cached HTML. Signed-in users swap to the app shell (with their accent) after
 * hydration.
 */
export function PublicShell({ children }: { children: React.ReactNode }) {
  const status = useAuthStore((s) => s.status);
  const accentColor = useAuthStore((s) => s.user?.accentColor ?? null);

  if (status === 'authenticated') {
    return (
      <AccentScope accentColor={accentColor}>
        <AuthenticatedShell>{children}</AuthenticatedShell>
      </AccentScope>
    );
  }

  return (
    <div data-app-shell className="min-h-screen bg-background text-foreground flex flex-col overflow-x-clip">
      <LandingNav />
      <main className="flex-1 pt-22">{children}</main>
      {/* Guests get Quick View too (AuthenticatedShell mounts its own). The
          title API is public; account actions hide when signed out. */}
      <QuickViewModal />
    </div>
  );
}
