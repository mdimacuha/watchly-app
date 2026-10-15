'use client';

import { useEffect, useState } from 'react';
import { useRegionStore } from '@/client/stores/region';
import { ProviderSection } from './ProviderSection';
import type { TitlePagePayload } from '@/services/tmdb/title';

type ProviderData = Pick<
  TitlePagePayload,
  'region' | 'providers' | 'providerSourceNote' | 'justWatchUrl' | 'fallbackRegion'
>;

/**
 * Region-specific "where to watch" section, fetched CLIENT-SIDE so the title
 * page itself can be rendered region-agnostically and ISR-cached. Reads the
 * user's region from the region store and hits the existing (region-aware)
 * /api/v1/titles endpoint, then renders the same <ProviderSection> the server
 * used to render. Re-runs when the region store hydrates or the user switches
 * region.
 */
export function ClientProviderSection({
  mediaType,
  id,
}: {
  mediaType: string;
  id: string;
}) {
  const regionCode = useRegionStore((s) => s.regionCode);
  const [data, setData] = useState<ProviderData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    // regionCode is '' until the region store hydrates; the endpoint falls back
    // to the cookie / US, and this effect re-runs once it's populated. We keep
    // any already-shown providers visible during a region-change re-fetch
    // rather than flashing the loading state (and avoid a synchronous setState).
    const q = regionCode ? `?region=${encodeURIComponent(regionCode)}` : '';

    fetch(`/api/v1/titles/${mediaType}/${id}${q}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (cancelled) return;
        if (json?.ok && json.data) {
          const d = json.data as TitlePagePayload;
          setData({
            region: d.region,
            providers: d.providers,
            providerSourceNote: d.providerSourceNote,
            justWatchUrl: d.justWatchUrl,
            fallbackRegion: d.fallbackRegion,
          });
        }
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [mediaType, id, regionCode]);

  if (loading || !data) {
    return (
      <div className="py-4 text-sm text-muted-foreground/60 animate-pulse">
        Loading availability…
      </div>
    );
  }

  return (
    <ProviderSection
      region={data.region}
      providers={data.providers}
      providerSourceNote={data.providerSourceNote}
      justWatchUrl={data.justWatchUrl}
      fallbackRegion={data.fallbackRegion}
    />
  );
}
