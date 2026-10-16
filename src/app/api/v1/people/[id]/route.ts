import { handleRoute } from '@/lib/api';
import { getPersonQuickView } from '@/services/tmdb/person';

/** Light person preview for the Quick View popup (top acting roles). */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handleRoute(async () => {
    const { id } = await params;
    return getPersonQuickView(id);
  });
}
