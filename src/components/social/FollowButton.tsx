'use client';

import { useState, useTransition } from 'react';
import { UserPlus, UserCheck, Hourglass, UserX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { useToast } from '@/hooks/useToast';
import {
  followAction,
  unfollowAction,
  cancelFollowRequestAction,
} from '@/actions/social';
import type { FollowStatus } from '@/services/social';

interface FollowButtonProps {
  targetUserId: string;
  initialStatus: FollowStatus | null;
  /** True when the viewer === target. We render nothing in that case. */
  isSelf: boolean;
  /** True when either party has blocked the other. We render nothing. */
  blocked?: boolean;
  className?: string;
  /** Compact = icon-only-on-hover variant for follower list rows. */
  size?: 'default' | 'sm';
  /** Target needs to approve follows (non-public profile): optimistic state is "Requested". */
  requiresApproval?: boolean;
  /** Called with each settled status (after the server answers or a rollback). */
  onStatusChange?: (status: FollowStatus | null) => void;
}

/**
 * Follow / Following / Requested / Unfollow button. States derive from
 * the current FollowStatus. Clicks call the matching server action with
 * optimistic UI; rollback + toast on failure.
 */
export function FollowButton({
  targetUserId,
  initialStatus,
  isSelf,
  blocked,
  className,
  size = 'default',
  requiresApproval = false,
  onStatusChange,
}: FollowButtonProps) {
  const [status, setLocalStatus] = useState<FollowStatus | null>(initialStatus);
  const setStatus = (next: FollowStatus | null) => {
    setLocalStatus(next);
    onStatusChange?.(next);
  };
  const [pending, startTransition] = useTransition();
  const [hovering, setHovering] = useState(false);
  const toast = useToast();

  if (isSelf || blocked) return null;

  const handleClick = () => {
    const previous = status;
    // Optimistic state machine — flip immediately, rollback on failure.
    if (status === 'accepted') {
      setStatus(null);
      startTransition(async () => {
        try {
          await unfollowAction(targetUserId);
        } catch {
          setStatus(previous);
          toast.error('Could not unfollow', 'Please try again.');
        }
      });
      return;
    }
    if (status === 'pending') {
      setStatus(null);
      startTransition(async () => {
        try {
          await cancelFollowRequestAction(targetUserId);
        } catch {
          setStatus(previous);
          toast.error('Could not cancel request', 'Please try again.');
        }
      });
      return;
    }
    // Not following → request. The server decides accepted vs pending
    // based on the target's profile visibility.
    // Optimistic guess, corrected by the server response.
    setStatus(requiresApproval ? 'pending' : 'accepted');
    startTransition(async () => {
      try {
        const next = await followAction(targetUserId);
        setStatus(next);
      } catch {
        setStatus(previous);
        toast.error('Could not follow', 'Please try again.');
      }
    });
  };

  const buttonProps = getButtonProps(status, hovering);

  return (
    <Button
      variant={buttonProps.variant}
      onClick={handleClick}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onFocus={() => setHovering(true)}
      onBlur={() => setHovering(false)}
      disabled={pending}
      size={size === 'sm' ? undefined : undefined}
      className={cn(
        'gap-2',
        size === 'sm' && 'h-8 px-3 text-xs',
        className,
      )}
    >
      <buttonProps.icon className={size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
      {buttonProps.label}
    </Button>
  );
}

interface ButtonShape {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  variant: 'default' | 'outline';
}

function getButtonProps(
  status: FollowStatus | null,
  hovering: boolean,
): ButtonShape {
  switch (status) {
    case 'accepted':
      // Hovering reveals the destructive intent — "Unfollow" + red-ish icon.
      return hovering
        ? { label: 'Unfollow', icon: UserX, variant: 'outline' }
        : { label: 'Following', icon: UserCheck, variant: 'outline' };
    case 'pending':
      // Pending means waiting on the target's accept. Hover = "Cancel".
      return hovering
        ? { label: 'Cancel request', icon: UserX, variant: 'outline' }
        : { label: 'Requested', icon: Hourglass, variant: 'outline' };
    case 'rejected':
    case 'cancelled':
    case null:
    default:
      return { label: 'Follow', icon: UserPlus, variant: 'default' };
  }
}

/**
 * Smaller variant used in follower lists where the row already shows
 * the user's avatar + name. Reduces visual weight.
 */
export function FollowButtonCompact(props: FollowButtonProps) {
  return <FollowButton {...props} size="sm" />;
}
