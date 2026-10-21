import { requireUser } from '@/server/auth/requireUser';
import { getReelPage } from '@/services/forYou/reel';
import { ReelFeed } from '@/components/forYou/reel/ReelFeed';

/** For You: a vertical reel of trailers picked for you. */
export default async function ForYouPage() {
  // Validates the session against the DB so a stale cookie redirects to
  // /signin cleanly.
  const userId = await requireUser();
  const { items } = await getReelPage(userId);
  return <ReelFeed initial={items} />;
}
