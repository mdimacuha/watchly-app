'use client';

import { useState, useTransition } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/useToast';
import { addCollectionToWatchlistSmartAction } from '@/actions/watchlists';
import { BulkAddCollectionPicker } from './BulkAddCollectionPicker';

interface AddCollectionToWatchlistButtonProps {
  collectionId: string;
  collectionName: string;
}

export function AddCollectionToWatchlistButton({
  collectionId,
  collectionName,
}: AddCollectionToWatchlistButtonProps) {
  const [isPickerOpen, setPickerOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  const handleClick = () => {
    startTransition(async () => {
      try {
        const result = await addCollectionToWatchlistSmartAction(collectionId);
        if (result.mode === 'direct') {
          toast.success(
            result.added === 0
              ? `All parts already in "${result.watchlist.name}"`
              : `Added ${result.added} ${result.added === 1 ? 'title' : 'titles'} to "${result.watchlist.name}"`,
          );
        } else {
          setPickerOpen(true);
        }
      } catch (err) {
        toast.error(
          'Could not add',
          err instanceof Error ? err.message : 'Please try again.',
        );
      }
    });
  };

  return (
    <>
      <Button onClick={handleClick} disabled={pending} className="gap-2">
        <Plus className="w-4 h-4" />
        <span>Add All Parts to Watchlist</span>
      </Button>
      <BulkAddCollectionPicker
        isOpen={isPickerOpen}
        onClose={() => setPickerOpen(false)}
        collectionId={collectionId}
        collectionName={collectionName}
      />
    </>
  );
}
