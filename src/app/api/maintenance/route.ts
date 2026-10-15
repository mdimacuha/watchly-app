import { NextResponse } from 'next/server';
import { getCurrentMaintenance } from '@/services/maintenance';

// Public, non-personalized maintenance flag. Read client-side by
// <MaintenanceGate> on every page load, so it MUST be edge-cacheable —
// otherwise it reintroduces a per-load function invocation (the opposite of
// what the ISR work is for). `getCurrentMaintenance` is itself unstable_cache'd
// (30s + tag-busted on toggle), so this endpoint stays cheap and fresh.
export const revalidate = 30;

export async function GET() {
  const active = await getCurrentMaintenance();

  return NextResponse.json(
    {
      active: !!active,
      reason: active?.reason ?? null,
      startedAt: active?.startedAt ?? null,
    },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
      },
    },
  );
}
