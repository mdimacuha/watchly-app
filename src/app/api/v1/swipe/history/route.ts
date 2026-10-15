import { handleRoute } from '@/lib/api';
import { resolveRequestingUser } from '@/server/auth/bearer';
import { UnauthorizedAppError } from '@/utils/errors';
import { resetSwipeHistory } from '@/services/swipe';

/**
 * DELETE /api/v1/swipe/history
 *
 * Wipes the caller's entire swipe history. Useful in development for
 * resetting the deck, and could be wired to a "Start over" button in
 * settings later. Does NOT touch Favorites.
 */
export async function DELETE(request: Request) {
  return handleRoute(async () => {
    const user = await resolveRequestingUser(request);
    if (!user) throw new UnauthorizedAppError();

    const deletedCount = await resetSwipeHistory(user.userId);
    return { deletedCount };
  });
}
