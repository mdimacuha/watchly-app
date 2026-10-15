'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/client/stores/auth';
import { useRegionStore } from '@/client/stores/region';
import { getCountryName } from '@/lib/regions/countries';

/**
 * Invisible component that hydrates the Zustand auth and region stores on
 * mount.  Fetches GET /api/me -- the HttpOnly cookie is sent automatically.
 *
 * Render once in the root layout; it produces no DOM output.
 */
export function AuthHydrator() {
  const setAuthenticated = useAuthStore((s) => s.setAuthenticated);
  const setUnauthenticated = useAuthStore((s) => s.setUnauthenticated);
  const setRegion = useRegionStore((s) => s.setRegion);
  const hydrateRegionFromCookie = useRegionStore((s) => s.hydrateFromCookie);

  useEffect(() => {
    let cancelled = false;

    // Seed region from the cookie immediately so unauthenticated visitors see
    // their last pick without waiting on /api/me. Authed users will have it
    // overwritten by the server pref below.
    hydrateRegionFromCookie();

    async function hydrate() {
      try {
        const res = await fetch('/api/me', { credentials: 'include' });

        if (cancelled) return;

        if (res.ok) {
          const json = await res.json();
          setAuthenticated(json.data.user);

          // Hydrate region store from the user's saved preference
          const code: string | null = json.data.regionCode;
          if (code && code !== 'unknown') {
            const name = getCountryName(code) ?? code;
            setRegion(code, name);
          }
        } else {
          setUnauthenticated();
        }
      } catch {
        if (!cancelled) {
          setUnauthenticated();
        }
      }
    }

    hydrate();

    return () => {
      cancelled = true;
    };
  }, [setAuthenticated, setUnauthenticated, setRegion, hydrateRegionFromCookie]);

  return null;
}
