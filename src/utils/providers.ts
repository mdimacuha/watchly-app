export const PROVIDER_DOMAINS: Record<string, string> = {
  Netflix: 'netflix.com',
  'Disney+': 'disneyplus.com',
  'Prime Video': 'primevideo.com',
  Prime: 'primevideo.com',
  Hulu: 'hulu.com',
  'HBO Max': 'max.com',
  Max: 'max.com',
  Peacock: 'peacocktv.com',
  'Apple TV+': 'tv.apple.com',
  Apple: 'apple.com',
  Google: 'google.com',
  YouTube: 'youtube.com',
  Crunchyroll: 'crunchyroll.com',
  'Paramount+': 'peacocktv.com', // check domain
  Starz: 'starz.com',
};

export function getProviderIcon(provider: string) {
  const domain = PROVIDER_DOMAINS[provider];
  if (!domain) {
    // Fallback: try to guess domain or return a generic placeholder logic
    // For now, return null or a default if not found in map
    return null;
  }
  // Use Google's favicon service to get the icon
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
}

/**
 * Collapse the long, noisy provider names TMDB/JustWatch return into the
 * compact display names we render in badges (e.g. "Amazon Prime Video With
 * Ads" → "Prime Video"). Use this anywhere a `provider_name` reaches the UI.
 */
export function cleanProviderName(name: string): string {
  let n = name.trim();

  // Drop ad-supported / tier suffixes — they make pills unreadable on cards.
  n = n.replace(/\s*\(?\bwith\s+ads\b\)?\s*$/i, "");
  n = n.replace(/\s*\(?\bno\s+ads\b\)?\s*$/i, "");
  n = n.replace(/\s+Amazon\s+Channel$/i, "");
  n = n.replace(/\s+basic$/i, "");
  n = n.replace(/\s+standard$/i, "");
  n = n.replace(/\s+premium$/i, "");

  // Brand canonicalization.
  if (/^Amazon Prime Video$/i.test(n)) n = "Prime Video";
  if (/^Disney Plus$/i.test(n)) n = "Disney+";
  if (/^Apple TV Plus$/i.test(n)) n = "Apple TV+";
  if (/^Google Play Movies$/i.test(n)) n = "Google Play";
  if (/^YouTube Premium$/i.test(n)) n = "YouTube";

  return n.trim();
}
