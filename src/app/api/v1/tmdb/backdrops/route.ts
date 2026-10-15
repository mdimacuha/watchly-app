import { handleRoute } from '@/lib/api';
import { getMigrationBackdrops } from '@/services/tmdb';

// Public (not under /api/me) — decorative stills for the migration modal.
export async function GET() {
  return handleRoute(() => getMigrationBackdrops(5));
}
