'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Tells the server the browser's timezone (a cookie), so "today" on /new is
 * the member's today. If the server guessed a different zone, re-render once.
 */
export function TimeZoneCookie({ serverZone }: { serverZone: string }) {
  const router = useRouter();
  useEffect(() => {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!zone) return;
    document.cookie = `watchly_tz=${encodeURIComponent(zone)}; path=/; max-age=31536000; samesite=lax`;
    if (zone !== serverZone) router.refresh();
  }, [serverZone, router]);
  return null;
}
