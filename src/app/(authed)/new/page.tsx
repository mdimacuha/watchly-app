import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { cn } from '@/lib/cn';
import { anton } from '@/lib/fonts';
import { requireUser } from '@/server/auth/requireUser';
import { getUserRegion } from '@/services/preferences';
import { dayIn, getNewFeed } from '@/services/newReleases';
import { NewLobby } from '@/components/new/NewLobby';
import { RegionRefresh } from '@/components/new/RegionRefresh';
import { TimeZoneCookie } from '@/components/new/TimeZoneCookie';

export const metadata: Metadata = { title: 'New & Coming Soon' };

// Until the browser tells us its zone (TimeZoneCookie), a best guess per country.
const ZONE_BY_REGION: Record<string, string> = {
  PH: 'Asia/Manila', US: 'America/New_York', GB: 'Europe/London', CA: 'America/Toronto', AU: 'Australia/Sydney', IN: 'Asia/Kolkata', JP: 'Asia/Tokyo', DE: 'Europe/Berlin',
};

function validZone(z: string | undefined): string | null {
  if (!z) return null;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: z });
    return z;
  } catch {
    return null;
  }
}

/**
 * New & Coming Soon ("The Lobby"): the country's film arrivals and the
 * week's TV. The region cookie (the sidebar picker) wins over the saved
 * preference, so a switch shows at once.
 */
export default async function NewAndComingSoonPage() {
  const userId = await requireUser();
  const jar = await cookies();
  const cookieRegion = jar.get('watchly_region')?.value;
  const saved = await getUserRegion(userId).catch(() => null);
  const region = [cookieRegion, saved].find((r): r is string => !!r && /^[A-Z]{2}$/.test(r)) ?? 'US';
  const zone = validZone(decodeURIComponent(jar.get('watchly_tz')?.value ?? '')) ?? ZONE_BY_REGION[region] ?? 'UTC';
  const feed = await getNewFeed(userId, region, dayIn(new Date(), zone));

  return (
    <div className={cn(anton.variable, 'w-full')}>
      <TimeZoneCookie serverZone={zone} />
      <RegionRefresh region={region} />
      <NewLobby feed={feed} />
    </div>
  );
}
