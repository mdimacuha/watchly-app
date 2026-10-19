'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRegionStore } from '@/client/stores/region';
import { getCountryName } from '@/lib/regions/countries';
import type { Provider, TitlePagePayload } from '@/services/tmdb/title';

// Region availability for the ISR-cached title page, fetched client-side by
// the user's region. A failed fetch ends in `error` (with retry), never an
// endless loading state. Quick View already has the payload and uses
// `toAvailability` directly.

export type AccessType = 'stream' | 'rent' | 'buy';

export interface Offer extends Provider {
  access: AccessType[];
}

export type Availability =
  | { status: 'loading' }
  | { status: 'error'; retry: () => void }
  | {
      status: 'empty';
      regionName: string;
    }
  | {
      status: 'ready';
      /** The user's region. */
      regionName: string;
      /** The region the offers belong to (differs on fallback). */
      shownRegionName: string;
      isFallbackRegion: boolean;
      viaJustWatch: boolean;
      justWatchUrl: string | null;
      stream: Offer[];
      /** Rent and buy merged per provider; `access` says which. */
      rentBuy: Offer[];
    };

type ProviderPayload = Pick<
  TitlePagePayload,
  'region' | 'providers' | 'providerSourceNote' | 'justWatchUrl' | 'fallbackRegion'
>;

export function toAvailability(d: ProviderPayload): Availability {
  const regionName = getCountryName(d.region) || d.region || 'your region';
  const { streaming, rent, buy } = d.providers;

  if (
    d.providerSourceNote === 'region_missing' ||
    d.providerSourceNote === 'no_providers' ||
    (streaming.length === 0 && rent.length === 0 && buy.length === 0)
  ) {
    return { status: 'empty', regionName };
  }

  const rentBuy = new Map<number, Offer>();
  for (const p of rent) rentBuy.set(p.provider_id, { ...p, access: ['rent'] });
  for (const p of buy) {
    const existing = rentBuy.get(p.provider_id);
    if (existing) existing.access.push('buy');
    else rentBuy.set(p.provider_id, { ...p, access: ['buy'] });
  }

  const isFallbackRegion = d.providerSourceNote === 'fallback_region' && !!d.fallbackRegion;

  return {
    status: 'ready',
    regionName,
    shownRegionName: isFallbackRegion
      ? getCountryName(d.fallbackRegion!) || d.fallbackRegion!
      : regionName,
    isFallbackRegion,
    viaJustWatch: d.providerSourceNote === 'fallback_justwatch',
    justWatchUrl: d.justWatchUrl ?? null,
    stream: streaming.map((p) => ({ ...p, access: ['stream'] })),
    rentBuy: Array.from(rentBuy.values()),
  };
}

export function useTitleAvailability(mediaType: string, id: string): Availability {
  const regionCode = useRegionStore((s) => s.regionCode);
  const [state, setState] = useState<Availability>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const q = regionCode ? `?region=${encodeURIComponent(regionCode)}` : '';

    fetch(`/api/v1/titles/${mediaType}/${id}${q}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((json) => {
        if (cancelled) return;
        if (!json?.ok || !json.data) throw new Error('bad payload');
        setState(toAvailability(json.data as TitlePagePayload));
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error', retry });
      });

    return () => {
      cancelled = true;
    };
  }, [mediaType, id, regionCode, attempt, retry]);

  return state;
}

export function accessLabel(access: AccessType[]): string {
  if (access.includes('stream')) return 'Included';
  if (access.includes('rent') && access.includes('buy')) return 'Rent or buy';
  return access.includes('rent') ? 'Rent' : 'Buy';
}
