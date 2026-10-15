import { trending } from '@/server/tmdb';
import { buildImageUrl } from '@/lib/tmdb';

/**
 * A handful of decorative backdrop stills for the migration modal.
 *
 * Pulls this week's trending movies/tv and returns ready-to-render `w1280`
 * image URLs. Intentionally region-agnostic so the response is globally
 * cacheable (tmdbFetch already revalidates hourly upstream).
 */
export async function getMigrationBackdrops(count = 5): Promise<string[]> {
  const data = await trending.all('week', { page: 1 });

  const urls: string[] = [];
  for (const item of data.results) {
    if (urls.length >= count) break;
    if (item.mediaType !== 'movie' && item.mediaType !== 'tv') continue;
    const url = buildImageUrl(item.backdropPath, 'w1280');
    if (url) urls.push(url);
  }
  return urls;
}
