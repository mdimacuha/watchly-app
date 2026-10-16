import { getForYouPoolAction } from '@/actions/forYou';
import { ForYouMain } from '@/components/forYou/ForYouProgramme';
import { requireUser } from '@/server/auth/requireUser';

/** Tonight's Programme: Feature · 2 Supports · Wildcard, tuned by the Dial. */
export default async function ForYouPage() {
  // Validates the session against the DB so a stale cookie redirects to
  // /signin cleanly instead of crashing inside the pool action.
  await requireUser();
  const pool = await getForYouPoolAction();
  return (
    <div className="px-4 sm:px-8 py-10 max-w-6xl mx-auto w-full">
      <ForYouMain pool={pool} />
    </div>
  );
}
