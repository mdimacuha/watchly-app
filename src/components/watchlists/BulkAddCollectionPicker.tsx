'use client';

import { useEffect, useState, useTransition } from 'react';
import { Plus, Bookmark } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/useToast';
import {
  addCollectionToWatchlistAction,
  createWatchlistAction,
  listWatchlistsAction,
} from '@/actions/watchlists';
import type { WatchlistWithCount } from '@/services/watchlists';

interface BulkAddCollectionPickerProps {
  isOpen: boolean;
  onClose: () => void;
  collectionId: string;
  collectionName: string;
}

export function BulkAddCollectionPicker({
  isOpen,
  onClose,
  collectionId,
  collectionName,
}: BulkAddCollectionPickerProps) {
  const [lists, setLists] = useState<WatchlistWithCount[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    // Cache-invalidate-on-open. The eslint rule flags sync setState in
    // effects but this pattern is legitimate: the picker must show a
    // loading state on each re-open since data may have changed.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLists(null);
    listWatchlistsAction().then((data) => {
      if (!cancelled) setLists(data);
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const addToList = (list: WatchlistWithCount) => {
    startTransition(async () => {
      try {
        const added = await addCollectionToWatchlistAction(list.id, collectionId);
        toast.success(
          added === 0
            ? `All parts already in "${list.name}"`
            : `Added ${added} ${added === 1 ? 'title' : 'titles'} to "${list.name}"`,
        );
        onClose();
      } catch (err) {
        toast.error(
          'Could not add',
          err instanceof Error ? err.message : 'Please try again.',
        );
      }
    });
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) return;

    startTransition(async () => {
      try {
        const created = await createWatchlistAction({ name: trimmed });
        const added = await addCollectionToWatchlistAction(
          created.id,
          collectionId,
        );
        toast.success(
          `Created "${trimmed}" and added ${added} ${added === 1 ? 'title' : 'titles'}`,
        );
        onClose();
      } catch (err) {
        toast.error(
          'Could not create',
          err instanceof Error ? err.message : 'Please try again.',
        );
      }
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-md">
      <div className="flex flex-col gap-3 p-6">
        <div className="pr-8">
          <h2 className="text-lg font-semibold">Add to watchlist</h2>
          <p className="text-sm text-muted-foreground">
            All parts of <span className="text-foreground">{collectionName}</span>{' '}
            will be added to the list you pick.
          </p>
        </div>

        {lists === null ? (
          <div className="text-sm text-muted-foreground py-4 text-center">
            Loading…
          </div>
        ) : lists.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-2">
            <Bookmark className="w-6 h-6 mx-auto mb-2 opacity-60" />
            No watchlists yet — create one below.
          </div>
        ) : (
          <ul className="flex flex-col gap-1 max-h-[320px] overflow-y-auto">
            {lists.map((list) => (
              <li key={list.id}>
                <button
                  type="button"
                  onClick={() => addToList(list)}
                  disabled={pending}
                  className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-md hover:bg-secondary/50 transition-colors text-left disabled:opacity-50"
                >
                  <span className="flex flex-col min-w-0">
                    <span className="text-sm font-medium truncate">
                      {list.name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {list.itemCount}{' '}
                      {list.itemCount === 1 ? 'item' : 'items'}
                    </span>
                  </span>
                  <Plus className="w-4 h-4 text-muted-foreground shrink-0" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {creating ? (
          <form
            onSubmit={handleCreate}
            className="flex gap-2 pt-2 border-t border-border/50"
          >
            <Input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New list name"
              maxLength={80}
            />
            <Button type="submit" disabled={pending || !newName.trim()}>
              Create
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setCreating(false);
                setNewName('');
              }}
              disabled={pending}
            >
              Cancel
            </Button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex items-center gap-2 px-3 py-2.5 rounded-md text-sm text-primary hover:bg-primary/10 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Create new list
          </button>
        )}
      </div>
    </Modal>
  );
}
