import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { cn } from '@/lib/cn';
import { anton } from '@/lib/fonts';
import { getTasteRow } from '@/services/onboarding';
import { FirstNight } from '@/components/onboarding/FirstNight';

export const metadata: Metadata = {
  title: 'Your first night',
  robots: { index: false, follow: true },
};

// The first run's guest half: three titles you love, then the account. The
// rest happens on /onboarding once signed in.
export default async function SignUpPage() {
  const cookieRegion = (await cookies()).get('watchly_region')?.value;
  const region = cookieRegion && /^[A-Z]{2}$/.test(cookieRegion) ? cookieRegion : 'US';
  const tasteRow = await getTasteRow(region);

  return (
    <div className={cn(anton.variable, 'min-h-dvh bg-background text-foreground')}>
      <FirstNight
        init={{ mode: 'guest', state: null, detectedRegion: null, fallbackRegion: region }}
        tasteRow={tasteRow}
        services={[]}
        countries={[]}
      />
    </div>
  );
}
