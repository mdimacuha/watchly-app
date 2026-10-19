'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRegionStore } from '@/client/stores/region';
import type { BadgeTarget, CardBadge } from '@/services/providers/cardBadges';

const BATCH = 40; // BADGES_BATCH_MAX on the server

/**
 * Availability badges for `targets` in the visitor's region, fetched from
 * /api/v1/providers/badges after hydration (so the page HTML stays cached and
 * region-agnostic). Returns `badgeKey → badges`: a key that's present was
 * checked (an empty array = "Not in your region"); a missing key isn't known
 * yet or its lookup failed — show nothing for it. Refetches on region change.
 */
export function useRegionBadges(targets: BadgeTarget[]): Record<string, CardBadge[]> {
  const region = useRegionStore((s) => s.regionCode);
  const [badges, setBadges] = useState<Record<string, CardBadge[]>>({});

  // Stable dependency: the set of titles, not the array identity.
  const signature = useMemo(() => targets.map((t) => `${t.mediaType}-${t.id}`).join(','), [targets]);

  useEffect(() => {
    if (!region || targets.length === 0) return;
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- new region: drop the old region's badges
    setBadges({});
    for (let i = 0; i < targets.length; i += BATCH) {
      fetch('/api/v1/providers/badges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ region, items: targets.slice(i, i + BATCH) }),
        signal: controller.signal,
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((json: { success?: boolean; data?: Record<string, CardBadge[]> } | null) => {
          if (json?.success && json.data) setBadges((cur) => ({ ...cur, ...json.data }));
        })
        .catch(() => {
          // Aborted or offline: leave these cards without a pill.
        });
    }
    return () => controller.abort();
    // `targets` is captured via `signature`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [region, signature]);

  return badges;
}
