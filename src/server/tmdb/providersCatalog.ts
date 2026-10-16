import { providers } from "@/server/tmdb/endpoints/providers";
import {
  PROVIDER_STYLE_OVERRIDES,
  PROVIDER_KEY_OVERRIDES,
  PROVIDER_STYLE_PALETTE,
  ProviderStyle,
} from "@/constants/providerStyles";

export interface CatalogProvider {
  provider_id: number;
  provider_name: string;
  logo_path: string | null;
  display_priority?: number;
  key: string;
  style: ProviderStyle;
}

export interface ProviderCatalog {
  updatedAt: string;
  providers: CatalogProvider[];
}

// In-memory cache, per region (availability differs by country — a single
// slot used to serve whichever region was fetched first to everyone).
const cache = new Map<string, { catalog: ProviderCatalog; fetchedAt: number }>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function normalizeProviderName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/&/g, "and")
    .replace(/[+]/g, "-plus")
    .replace(/[^\w\s-]/g, "") // remove punctuation
    .replace(/\s+/g, "-");
}

function assignStyle(id: number, key: string): ProviderStyle {
  // 1. Try ID override
  if (PROVIDER_STYLE_OVERRIDES[id]) {
    return PROVIDER_STYLE_OVERRIDES[id];
  }

  // 2. Try Key override
  if (PROVIDER_KEY_OVERRIDES[key]) {
    return PROVIDER_KEY_OVERRIDES[key];
  }

  // 3. Fallback: Deterministic palette
  const index = id % PROVIDER_STYLE_PALETTE.length;
  return PROVIDER_STYLE_PALETTE[index];
}

export async function getProvidersCatalog(region: string = "US"): Promise<ProviderCatalog> {
  const now = Date.now();

  const cached = cache.get(region);
  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.catalog;
  }

  try {
    // Fetch movie and TV providers in parallel
    const [movieData, tvData] = await Promise.all([
      providers.movieProviders(region),
      providers.tvProviders(region),
    ]);

    const allProviders = [...(movieData.results || []), ...(tvData.results || [])];
    
    // Deduplicate by provider_id
    const uniqueProvidersMap = new Map<number, CatalogProvider>();

    for (const p of allProviders) {
      if (!uniqueProvidersMap.has(p.provider_id)) {
        const key = normalizeProviderName(p.provider_name);
        uniqueProvidersMap.set(p.provider_id, {
          provider_id: p.provider_id,
          provider_name: p.provider_name,
          logo_path: p.logo_path,
          display_priority: p.display_priority,
          key,
          style: assignStyle(p.provider_id, key),
        });
      }
    }

    const catalog: ProviderCatalog = {
      updatedAt: new Date().toISOString(),
      providers: Array.from(uniqueProvidersMap.values()).sort((a, b) => {
        // Sort by display priority (lower is better), then name
        const pA = a.display_priority ?? 9999;
        const pB = b.display_priority ?? 9999;
        if (pA !== pB) return pA - pB;
        return a.provider_name.localeCompare(b.provider_name);
      }),
    };

    cache.set(region, { catalog, fetchedAt: now });

    return catalog;
  } catch (error) {
    console.error("Failed to fetch TMDB providers:", error);
    // Return empty catalog or stale cache if available
    if (cached) return cached.catalog;
    return { updatedAt: new Date().toISOString(), providers: [] };
  }
}
