import { NextResponse } from 'next/server';
import { getSession } from '@/server/auth/session';
import { limiters } from '@/server/ratelimit';
import { tooManyResponse } from '@/server/ratelimit/response';
import { exportMyData } from '@/services/settings/export';

export const dynamic = 'force-dynamic';

/** "Download my data" (Settings): the signed-in user's own rows as a JSON file. */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  const rl = limiters.dataExport.limit(`user:${session.userId}`);
  if (!rl.success) return tooManyResponse(rl.retryAfter);

  const data = await exportMyData(session.userId);
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="watchly-export-${date}.json"`,
      'Cache-Control': 'no-store',
    },
  });
}
