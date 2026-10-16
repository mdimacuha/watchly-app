'use client';

import { useEffect, useState } from 'react';
import { useRegionStore } from '@/client/stores/region';
import type { ApiResponse } from '@/types/api';
import type { SearchService } from '@/services/search';

/**
 * Shown until the region's list loads (and if it fails): the big services
 * by their US TMDB ids.
 */
export const FALLBACK_SERVICES: SearchService[] = [
  { id: 8, name: 'Netflix', logoPath: null, featured: true },
  { id: 9, name: 'Amazon Prime Video', logoPath: null, featured: true },
  { id: 337, name: 'Disney Plus', logoPath: null, featured: true },
  { id: 15, name: 'Hulu', logoPath: null, featured: true },
  { id: 1899, name: 'Max', logoPath: null, featured: true },
  { id: 350, name: 'Apple TV+', logoPath: null, featured: true },
];

/** Legacy `?service=` slugs from older links → provider ids. */
export const LEGACY_SERVICE_SLUGS: Record<string, number> = {
  netflix: 8,
  prime: 9,
  disney: 337,
  hulu: 15,
  max: 1899,
  apple: 350,
};

// One request per region per page load, shared by every caller.
const requests = new Map<string, Promise<SearchService[]>>();

function load(region: string): Promise<SearchService[]> {
  let req = requests.get(region);
  if (!req) {
    req = fetch(`/api/v1/search/services?region=${encodeURIComponent(region)}`)
      .then(async (res) => {
        const json = (await res.json()) as ApiResponse<SearchService[]>;
        if (!res.ok || !json.success || !json.data?.length) throw new Error('services failed');
        return json.data;
      })
      .catch(() => {
        requests.delete(region); // allow a retry later
        return FALLBACK_SERVICES;
      });
    requests.set(region, req);
  }
  return req;
}

/** Streaming services for the search filter: popular first, then all others. */
export function useSearchServices(): SearchService[] {
  const region = useRegionStore((s) => s.regionCode) || 'US';
  const [services, setServices] = useState<SearchService[]>(FALLBACK_SERVICES);
  useEffect(() => {
    let active = true;
    load(region).then((list) => {
      if (active) setServices(list);
    });
    return () => {
      active = false;
    };
  }, [region]);
  return services;
}

/** Display name for a `?service=` value (provider id or legacy slug). */
export function serviceName(services: SearchService[], value: string): string {
  const id = LEGACY_SERVICE_SLUGS[value] ?? Number(value);
  return services.find((s) => s.id === id)?.name ?? FALLBACK_SERVICES.find((s) => s.id === id)?.name ?? value;
}
