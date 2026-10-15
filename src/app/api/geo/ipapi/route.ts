import { handleRoute } from '@/lib/api';
import { lookupGeoByIP } from '@/services/geo';

export async function GET() {
  return handleRoute(() => lookupGeoByIP());
}
