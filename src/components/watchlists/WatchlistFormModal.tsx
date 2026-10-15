'use client';

import { useState, useTransition } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/useToast';

interface WatchlistFormValues {
  name: string;
  description: string;
  isPublic: boolean;
}

interface WatchlistFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Heading shown at the top of the form. */
  title: string;
  /** Submit button label. */
  submitLabel: string;
  initialValues?: Partial<WatchlistFormValues>;
  onSubmit: (values: WatchlistFormValues) => Promise<void>;
}

export function WatchlistFormModal({
  isOpen,
  onClose,
  title,
  submitLabel,
  initialValues,
  onSubmit,
}: WatchlistFormModalProps) {
  const [name, setName] = useState(initialValues?.name ?? '');
  const [description, setDescription] = useState(
    initialValues?.description ?? '',
  );
  const [isPublic, setIsPublic] = useState(initialValues?.isPublic ?? false);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    startTransition(async () => {
      try {
        await onSubmit({ name: trimmed, description: description.trim(), isPublic });
        onClose();
      } catch (err) {
        toast.error(
          'Could not save',
          err instanceof Error ? err.message : 'Please try again.',
        );
      }
    });
  };

  // Note: title rendered inside the body (not via Modal's `title` prop) so we
  // control padding. The Modal's built-in title slot has none.
  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-md">
      <form onSubmit={handleSubmit} className="flex flex-col gap-5 p-6">
        <h2 className="text-lg font-semibold pr-8">{title}</h2>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="watchlist-name" className="text-sm font-medium">
            Name
          </label>
          <Input
            id="watchlist-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Weekend picks"
            maxLength={80}
            autoFocus
            required
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="watchlist-desc" className="text-sm font-medium">
            Description <span className="text-muted-foreground">(optional)</span>
          </label>
          <textarea
            id="watchlist-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What's this list about?"
            maxLength={500}
            rows={3}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
          />
        </div>

        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={isPublic}
            onChange={(e) => setIsPublic(e.target.checked)}
            className="w-4 h-4 accent-primary cursor-pointer"
          />
          <span>Make this list public</span>
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending || !name.trim()}>
            {pending ? 'Saving…' : submitLabel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
