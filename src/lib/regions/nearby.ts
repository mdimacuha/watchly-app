// Fallback order when a title has no providers in the user's region (title
// page + Quick View only — cards never show another country). Nearest
// markets first; US is appended last by `fallbackRegionsFor`.
const NEARBY_REGIONS: Record<string, string[]> = {
  PH: ['SG', 'MY', 'ID', 'TH', 'HK', 'TW', 'JP', 'KR', 'AU'],
  JP: ['KR', 'TW', 'HK', 'SG', 'AU'],
  AU: ['NZ', 'SG', 'MY', 'ID', 'JP'],
  GB: ['IE', 'FR', 'NL', 'BE', 'DE'],
  US: ['CA', 'MX'],
};

/** Regions to try, nearest first, ending with US (unless the user is in US). */
export function fallbackRegionsFor(region: string): string[] {
  const nearby = NEARBY_REGIONS[region] ?? [];
  return region === 'US' || nearby.includes('US') ? nearby : [...nearby, 'US'];
}
