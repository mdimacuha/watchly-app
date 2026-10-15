import { AppError } from '@/utils/errors';
import { logger } from '@/lib/log';

const GEO_LOOKUP_FAILED = 'GEO_LOOKUP_FAILED';

/**
 * Looks up the caller's country code via ipapi.co.
 * Returns `{ countryCode }` (e.g. `{ countryCode: "PH" }`).
 *
 * IMPORTANT: `cache: 'no-store'` is required. Next.js' fetch cache is
 * keyed only by URL, so a shared revalidate window would serve the
 * first user's region to every subsequent caller — onboarding's
 * auto-detect would look "broken" because everyone resolved to the
 * same country. Per-user freshness wins over the 1 ipapi call per
 * onboarding session cost.
 *
 * Throws an AppError with a 502 status if the external service is
 * unavailable or returns an unexpected payload.
 */
export async function lookupGeoByIP(): Promise<{ countryCode: string }> {
  const response = await fetch('https://ipapi.co/json/', {
    method: 'GET',
    headers: { 'User-Agent': 'Watchly-V2/1.0' },
    cache: 'no-store',
  });

  if (!response.ok) {
    logger.error('IPAPI error', undefined, {
      status: response.status,
      statusText: response.statusText,
    });
    throw new AppError('Geo lookup failed', {
      code: GEO_LOOKUP_FAILED,
      statusCode: 502,
    });
  }

  const data = await response.json();

  if (!data.country_code) {
    logger.error('IPAPI response missing country_code', undefined, { data });
    throw new AppError('Geo lookup failed', {
      code: GEO_LOOKUP_FAILED,
      statusCode: 502,
    });
  }

  return { countryCode: data.country_code };
}
