'use client';

import { useEffect, useState, useTransition } from 'react';
import { Plus, Check, Bookmark } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/watchly/EmptyState';
import { useToast } from '@/hooks/useToast';
import {
  addToWatchlistsAction,
  createWatchlistAction,
  getWatchlistsForPickerAction,
} from '@/actions/watchlists';
import type { WatchlistMediaType } from '@/services/watchlists';

interface PickerEntry {
  id: string;
  name: string;
  itemCount: number;
  containsItem: boolean;
}

interface AddToWatchlistPickerProps {
  isOpen: boolean;
  onClose: () => void;
  mediaType: WatchlistMediaType;
  mediaId: string;
  /** Optional title for header context, e.g. Add "{title}" to a list. */
  title?: string;
  /**
   * Reports whether the title is now in at least one list — on load (current
   * membership) and after a confirm (true). Lets the trigger button reflect an
   * "Added to Watchlist" state.
   */
  onMembershipChange?: (inAnyList: boolean) => void;
}

export function AddToWatchlistPicker({
  isOpen,
  onClose,
  mediaType,
  mediaId,
  title,
  onMembershipChange,
}: AddToWatchlistPickerProps) {
  const [lists, setLists] = useState<PickerEntry[] | null>(null);
  // Local, add-only selection of NON-contained list ids. Seeded empty on open
  // — already-contained lists render as "Added" and are never selectable, so
  // nothing here can remove an item. No server call happens until Confirm.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    // Reset to a clean "loading" state whenever the picker re-opens or the
    // target changes — the eslint rule flags sync setState in effects, but
    // this is a legitimate cache-invalidate-on-open pattern.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLists(null);
     
    setSelected(new Set());
     
    setCreating(false);
     
    setNewName('');
    getWatchlistsForPickerAction(mediaType, mediaId).then((data) => {
      if (cancelled) return;
      setLists(data);
      // Sync the trigger button to the true membership at open time (handles
      // the title having been added/removed elsewhere since the page loaded).
      onMembershipChange?.(data.some((l) => l.containsItem));
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen, mediaType, mediaId, onMembershipChange]);

  // Toggle a non-contained list in/out of the local selection. Local only —
  // the server is not touched until the user confirms.
  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedCount = selected.size;

  const handleConfirm = () => {
    const ids = [...selected];
    if (ids.length === 0) return;

    startTransition(async () => {
      try {
        const added = await addToWatchlistsAction(mediaType, mediaId, ids);
        if (added === 0) {
          // Everything selected was already present (e.g. added in another
          // tab). Surface it honestly rather than a false "Added".
          toast.info(
            'Already added',
            'Those lists already contain this title.',
          );
        } else {
          toast.success(
            `Added to ${added} ${added === 1 ? 'watchlist' : 'watchlists'}`,
          );
        }
        // The confirmed lists now contain the title → the trigger button
        // should read "Added to Watchlist".
        onMembershipChange?.(true);
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
        // Append the new (empty) list and pre-select it so the title is added
        // to it on Confirm, keeping the whole flow to a single add step.
        setLists((prev) => [
          ...(prev ?? []),
          {
            id: created.id,
            name: created.name,
            itemCount: 0,
            containsItem: false,
          },
        ]);
        setSelected((prev) => {
          const next = new Set(prev);
          next.add(created.id);
          return next;
        });
        setNewName('');
        setCreating(false);
        toast.success('List created', `Confirm to add the title to "${trimmed}".`);
      } catch (err) {
        toast.error(
          'Could not create',
          err instanceof Error ? err.message : 'Please try again.',
        );
      }
    });
  };

  const createForm = (
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
        aria-label="New list name"
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
  );

  const createCta = (
    <button
      type="button"
      onClick={() => setCreating(true)}
      className="flex items-center gap-2 px-3 py-2.5 rounded-md text-sm text-primary hover:bg-primary/10 transition-colors"
    >
      <Plus className="w-4 h-4" />
      Create new list
    </button>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-md">
      <div className="flex flex-col gap-3 p-6">
        <h2 className="text-lg font-semibold pr-8 truncate">
          {title ? `Add "${title}" to a list` : 'Add to watchlist'}
        </h2>

        {lists === null ? (
          <div className="flex flex-col gap-1 py-1" aria-busy="true">
            <span className="sr-only">Loading your watchlists</span>
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-3 px-3 py-2.5"
                aria-hidden="true"
              >
                <div className="flex flex-col gap-1.5 flex-1">
                  <div className="h-4 w-32 rounded bg-secondary animate-pulse" />
                  <div className="h-3 w-16 rounded bg-secondary/60 animate-pulse" />
                </div>
                <div className="h-5 w-5 rounded-md bg-secondary animate-pulse" />
              </div>
            ))}
          </div>
        ) : lists.length === 0 ? (
          creating ? (
            createForm
          ) : (
            <EmptyState
              icon={Bookmark}
              title="Create your first list"
              description="You don't have any watchlists yet. Create one to start saving titles you want to watch."
              className="min-h-[220px] p-4"
              action={
                <Button type="button" onClick={() => setCreating(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Create a list
                </Button>
              }
            />
          )
        ) : (
          <>
            <ul className="flex flex-col gap-1 max-h-[320px] overflow-y-auto">
              {lists.map((entry) => {
                const isContained = entry.containsItem;
                const isSelected = selected.has(entry.id);
                const checked = isContained || isSelected;
                return (
                  <li key={entry.id}>
                    <button
                      type="button"
                      onClick={() => {
                        if (!isContained) toggle(entry.id);
                      }}
                      disabled={isContained || pending}
                      aria-pressed={checked}
                      className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-md text-left transition-colors enabled:hover:bg-secondary/50 disabled:cursor-default"
                    >
                      <span className="flex flex-col min-w-0">
                        <span className="text-sm font-medium truncate">
                          {entry.name}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {isContained
                            ? 'Added'
                            : `${entry.itemCount} ${
                                entry.itemCount === 1 ? 'item' : 'items'
                              }`}
                        </span>
                      </span>
                      <span
                        className={
                          'h-5 w-5 rounded-md border flex items-center justify-center shrink-0 ' +
                          (checked
                            ? 'bg-primary border-primary text-primary-foreground'
                            : 'border-input') +
                          (isContained ? ' opacity-60' : '')
                        }
                      >
                        {checked && <Check className="w-3.5 h-3.5" />}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            {creating ? createForm : createCta}

            <div className="flex items-center justify-between gap-3 pt-3 border-t border-border/50">
              <span className="text-xs text-muted-foreground">
                {selectedCount > 0
                  ? `${selectedCount} selected`
                  : 'Select lists to add'}
              </span>
              <Button
                type="button"
                onClick={handleConfirm}
                disabled={selectedCount === 0 || pending}
              >
                {pending
                  ? 'Adding…'
                  : selectedCount > 0
                    ? `Add to ${selectedCount} ${
                        selectedCount === 1 ? 'list' : 'lists'
                      }`
                    : 'Add'}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
