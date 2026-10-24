'use client';

import { useEffect, useRef, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useRegionStore } from '@/client/stores/region';
import { getCountryName } from '@/lib/regions/countries';

/**
 * Re-renders the page when the member switches region from the sidebar, so
 * the board and timetable follow without a reload (the picker writes the
 * region cookie, which the page reads first). Says so while it loads.
 */
export function RegionRefresh({ region }: { region: string }) {
  const router = useRouter();
  const code = useRegionStore((s) => s.regionCode);
  const asked = useRef(region);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!/^[A-Z]{2}$/.test(code) || code === region || code === asked.current) return;
    asked.current = code;
    start(() => router.refresh());
  }, [code, region, router]);

  if (!pending) return null;
  return (
    <p role="status" className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm text-foreground shadow-elevation-card">
      <Loader2 size={14} className="animate-spin motion-reduce:animate-none" aria-hidden />
      Loading what&apos;s new in {getCountryName(code) ?? code}…
    </p>
  );
}
