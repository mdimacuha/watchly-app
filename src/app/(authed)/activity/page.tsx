import { getActivityAction } from '@/actions/activity';
import { ActivityPage } from '@/components/activity/ActivityPage';
import { requireUser } from '@/server/auth/requireUser';

export default async function Page() {
  // Middleware only checks cookie presence; this validates against the
  // DB and redirects to /signin if the session has gone stale.
  await requireUser();
  const data = await getActivityAction();
  return <ActivityPage data={data} />;
}
