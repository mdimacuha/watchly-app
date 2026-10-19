import { handleRoute } from '@/lib/api';
import { getCollectionQuickView } from '@/services/tmdb/collection';

/** Light collection preview for the Quick View popup (films + runtime, no providers). */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ collectionId: string }> },
) {
  return handleRoute(async () => {
    const { collectionId } = await params;
    return getCollectionQuickView(collectionId);
  });
}
