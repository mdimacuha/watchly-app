import { UserPlus } from 'lucide-react';
import { requireUser } from '@/server/auth/requireUser';
import { listPendingFollowRequests } from '@/services/social';
import { BackLink } from '@/components/nav/BackLink';
import { FollowRequestRow } from '@/components/social/FollowRequestRow';
import { EmptyState } from '@/components/watchly/EmptyState';

export default async function FollowRequestsPage() {
  const userId = await requireUser();
  const requests = await listPendingFollowRequests(userId);

  return (
    <div className="px-8 py-10 max-w-2xl mx-auto w-full flex flex-col gap-6">
      <BackLink fallbackHref="/notifications" label="Back to Notifications" />

      <header className="flex items-center gap-3">
        <UserPlus size={24} className="text-primary" />
        <h1 className="text-h2">Follow requests</h1>
      </header>
      <p className="text-sm text-muted-foreground -mt-2">
        These users want to follow you. Accept to let them see your private
        activity; decline to dismiss.
      </p>

      {requests.length === 0 ? (
        <EmptyState
          icon={UserPlus}
          title="No pending requests"
          description="When someone with a private-profile follow request lands here, you'll see them."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {requests.map((u) => (
            <FollowRequestRow key={u.id} user={u} />
          ))}
        </div>
      )}
    </div>
  );
}
