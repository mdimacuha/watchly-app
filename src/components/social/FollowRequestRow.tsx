'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Check, X } from 'lucide-react';
import { UserAvatar } from '@/components/ui/user-avatar';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/useToast';
import {
  acceptFollowRequestAction,
  rejectFollowRequestAction,
} from '@/actions/social';
import type { PublicUserCard } from '@/services/social';

interface FollowRequestRowProps {
  user: PublicUserCard;
}

/**
 * Single row in the pending-follow-requests inbox. Accept / Decline
 * buttons fire actions; on completion the row disappears via optimistic
 * local state (no full-page revalidate needed for the decision feedback).
 */
export function FollowRequestRow({ user }: FollowRequestRowProps) {
  const [resolvedAs, setResolvedAs] = useState<'accepted' | 'rejected' | null>(
    null,
  );
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  const handleAccept = () => {
    setResolvedAs('accepted');
    startTransition(async () => {
      try {
        await acceptFollowRequestAction(user.id);
        toast.success(`@${user.username} is now following you`);
      } catch {
        setResolvedAs(null);
        toast.error('Could not accept', 'Please try again.');
      }
    });
  };

  const handleReject = () => {
    setResolvedAs('rejected');
    startTransition(async () => {
      try {
        await rejectFollowRequestAction(user.id);
        toast.success('Request dismissed');
      } catch {
        setResolvedAs(null);
        toast.error('Could not dismiss', 'Please try again.');
      }
    });
  };

  // Collapse the row once the request resolves so the user sees their
  // action confirmed without waiting for a full-page refresh.
  if (resolvedAs) {
    return (
      <div className="text-xs text-muted-foreground px-3 py-2">
        {resolvedAs === 'accepted'
          ? `Accepted @${user.username}.`
          : `Dismissed request from @${user.username}.`}
      </div>
    );
  }

  const heading = user.displayName || user.username;

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-border">
      <Link
        href={`/user/${user.username}`}
        className="flex items-center gap-3 flex-1 min-w-0"
      >
        <UserAvatar
          avatarUrl={user.avatarUrl}
          firstName={user.firstName}
          lastName={user.lastName}
          size="md"
        />
        <div className="flex flex-col min-w-0">
          <span className="text-sm font-semibold text-foreground truncate">
            {heading}
          </span>
          <span className="text-xs text-muted-foreground truncate">
            @{user.username} — wants to follow you
          </span>
        </div>
      </Link>
      <div className="flex items-center gap-2 shrink-0">
        <Button
          variant="outline"
          onClick={handleReject}
          disabled={pending}
          className="h-8 px-3 text-xs gap-1.5"
        >
          <X className="w-3.5 h-3.5" />
          Decline
        </Button>
        <Button
          onClick={handleAccept}
          disabled={pending}
          className="h-8 px-3 text-xs gap-1.5"
        >
          <Check className="w-3.5 h-3.5" />
          Accept
        </Button>
      </div>
    </div>
  );
}
