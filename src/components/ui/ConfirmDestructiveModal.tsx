'use client';

import { useTransition, type ReactNode } from 'react';
import { Trash2, type LucideIcon } from 'lucide-react';
import { Modal } from './Modal';
import { Button } from './button';
import { useToast } from '@/hooks/useToast';

interface ConfirmDestructiveModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Bold heading. */
  title: ReactNode;
  /** Body copy explaining what will happen. */
  description: ReactNode;
  /** Text on the destructive (red) button. Defaults to "Delete". */
  confirmLabel?: string;
  /** Text on the cancel button. Defaults to "Cancel". */
  cancelLabel?: string;
  /** Icon shown in the red circle. Defaults to `Trash2`. */
  icon?: LucideIcon;
  /** Runs when the user confirms. May be async; the modal closes on success. */
  onConfirm: () => Promise<void> | void;
}

export function ConfirmDestructiveModal({
  isOpen,
  onClose,
  title,
  description,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  icon: Icon = Trash2,
  onConfirm,
}: ConfirmDestructiveModalProps) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  const handleConfirm = () => {
    startTransition(async () => {
      try {
        await onConfirm();
        onClose();
      } catch (err) {
        toast.error(
          'Action failed',
          err instanceof Error ? err.message : 'Please try again.',
        );
      }
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-sm">
      <div className="flex flex-col items-center text-center gap-4 px-6 pb-6 pt-10">
        <div className="h-14 w-14 rounded-full bg-destructive/15 flex items-center justify-center">
          <Icon className="w-6 h-6 text-destructive" />
        </div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground max-w-xs">
          {description}
        </p>
        <div className="flex items-center gap-3 w-full mt-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={pending}
            className="flex-1"
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleConfirm}
            disabled={pending}
            className="flex-1"
          >
            {pending ? 'Working…' : confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
