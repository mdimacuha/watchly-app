import { redirect } from 'next/navigation';
import { requireUser } from '@/server/auth/requireUser';
import { getForYouPoolAction } from '@/actions/forYou';
import { ForYouDeeper } from '@/components/forYou/ForYouPrototype';

/**
 * PROTOTYPE: "Go deeper" — the Dial over "Because you liked X" sections.
 * Dev builds only; production has no deeper page yet.
 */
export default async function ForYouDeeperPage() {
  await requireUser();
  if (process.env.NODE_ENV === 'production') redirect('/for-you');
  const pool = await getForYouPoolAction();
  return (
    <div className="px-4 sm:px-8 py-10 max-w-5xl mx-auto w-full">
      <ForYouDeeper pool={pool} />
    </div>
  );
}
