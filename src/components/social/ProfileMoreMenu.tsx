'use client';

import { useEffect, useRef, useState } from 'react';
import { MoreHorizontal, Ban, UserMinus2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useToast } from '@/hooks/useToast';
import { ConfirmDestructiveModal } from '@/components/ui/ConfirmDestructiveModal';
import { blockAction, unblockAction } from '@/actions/social';

interface ProfileMoreMenuProps {
  targetUserId: string;
  targetUsername: string;
  /** Current block state — drives Block vs Unblock copy. */
  isBlocked: boolean;
}

/**
 * Three-dot menu next to the Follow button on /user/[username]. v1 has
 * a single Block/Unblock action; future items (Report, Share profile)
 * can drop in alongside.
 */
export function ProfileMoreMenu({
  targetUserId,
  targetUsername,
  isBlocked,
}: ProfileMoreMenuProps) {
  const [open, setOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const toast = useToast();

  // Outside-click / Escape closes the menu.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const handleBlockClick = () => {
    setOpen(false);
    if (isBlocked) {
      // Unblock is non-destructive — no confirm needed.
      void doUnblock();
    } else {
      // Block severs follow edges + hides the user. Confirm first.
      setConfirmOpen(true);
    }
  };

  const doBlock = async () => {
    try {
      await blockAction(targetUserId);
      toast.success(`Blocked @${targetUsername}`);
    } catch {
      toast.error('Could not block', 'Please try again.');
      throw new Error('rollback');
    }
  };

  const doUnblock = async () => {
    try {
      await unblockAction(targetUserId);
      toast.success(`Unblocked @${targetUsername}`);
    } catch {
      toast.error('Could not unblock', 'Please try again.');
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors cursor-pointer"
        aria-label="More options"
      >
        <MoreHorizontal className="w-5 h-5" />
      </button>

      {open && (
        <div
          role="menu"
          className={cn(
            'absolute right-0 top-full mt-2 z-30 min-w-[180px]',
            'rounded-lg border border-border bg-card shadow-xl overflow-hidden',
          )}
        >
          <button
            type="button"
            role="menuitem"
            onClick={handleBlockClick}
            className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
          >
            {isBlocked ? (
              <>
                <UserMinus2 className="w-3.5 h-3.5" />
                Unblock @{targetUsername}
              </>
            ) : (
              <>
                <Ban className="w-3.5 h-3.5" />
                Block @{targetUsername}
              </>
            )}
          </button>
        </div>
      )}

      <ConfirmDestructiveModal
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={`Block @${targetUsername}?`}
        description="They won't be able to follow you or see your profile. Any existing follow connection between you two will be removed. You can unblock anytime."
        confirmLabel="Block"
        onConfirm={doBlock}
      />
    </div>
  );
}
