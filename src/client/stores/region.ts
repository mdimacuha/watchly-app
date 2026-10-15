import { create } from 'zustand';
import { getCountryName } from '@/lib/regions/countries';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SupportedRegion {
  code: string;
  name: string;
}

export const SUPPORTED_REGIONS: SupportedRegion[] = [
  { code: 'PH', name: 'Philippines' },
  { code: 'US', name: 'United States' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'AU', name: 'Australia' },
  { code: 'JP', name: 'Japan' },
];

// ---------------------------------------------------------------------------
// Cookie helpers
// ---------------------------------------------------------------------------

// Non-httpOnly: read by both server (next/headers) and client.
export const REGION_COOKIE = 'watchly_region';
const REGION_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

function writeRegionCookie(code: string) {
  if (typeof document === 'undefined') return;
  document.cookie =
    `${REGION_COOKIE}=${encodeURIComponent(code)};` +
    ` path=/; max-age=${REGION_COOKIE_MAX_AGE}; samesite=lax`;
}

export function readRegionCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(
    new RegExp('(?:^|; )' + REGION_COOKIE + '=([^;]*)'),
  );
  return match ? decodeURIComponent(match[1]) : null;
}

// ---------------------------------------------------------------------------
// State + actions
// ---------------------------------------------------------------------------

interface RegionState {
  regionCode: string;
  regionName: string;
}

interface RegionActions {
  setRegion: (code: string, name: string) => void;
  hydrateFromCookie: () => void;
}

export const useRegionStore = create<RegionState & RegionActions>((set) => ({
  regionCode: '',
  regionName: '',

  setRegion: (code, name) => {
    set({ regionCode: code, regionName: name });
    writeRegionCookie(code);
  },

  hydrateFromCookie: () => {
    const code = readRegionCookie();
    if (!code) return;
    const name = getCountryName(code) ?? code;
    set({ regionCode: code, regionName: name });
  },
}));
