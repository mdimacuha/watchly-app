import { requireUser } from '@/server/auth/requireUser';
import { getForYouPoolAction } from '@/actions/forYou';
import { ForYouDeeper } from '@/components/forYou/ForYouProgramme';

/** "Go deeper": the Dial over "Because you liked X" sections. */
export default async function ForYouDeeperPage() {
  await requireUser();
  const pool = await getForYouPoolAction();
  return (
    <div className="px-4 sm:px-8 py-10 max-w-5xl mx-auto w-full">
      <ForYouDeeper pool={pool} />
    </div>
  );
}
