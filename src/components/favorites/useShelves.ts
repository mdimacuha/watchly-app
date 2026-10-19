'use client';

import { useCallback, useState } from 'react';
import { useToast } from '@/hooks/useToast';
import {
  addToShelfAction,
  createShelfAction,
  deleteShelfAction,
  listShelvesAction,
  removeFromShelfAction,
  setItemShelvesAction,
  updateShelfAction,
  type ShelfActionResult,
} from '@/actions/favorites';
import type { AccentSlug } from '@/constants/accentColors';
import type { Shelf, ShelfItem, ShelvesPayload } from '@/services/favorites/shelves';

export type Folder = Shelf;

/**
 * The user's shelves, kept in local state for instant UI and saved through
 * the shelf server actions. Every change applies optimistically; if the
 * server rejects it, the error is toasted and state is reloaded from the
 * server so the page matches what's stored. Shelf ids are generated here so
 * a new shelf can be opened before the round-trip.
 */
export function useShelves(initial: ShelvesPayload) {
  const [shelves, setShelves] = useState<Shelf[]>(initial.shelves);
  const [items, setItems] = useState<ShelfItem[]>(initial.items);
  const toast = useToast();

  const save = useCallback(
    (request: Promise<ShelfActionResult>) => {
      request
        .then(async (r) => {
          if (r.ok) return;
          toast.error('Couldn’t save that', r.error);
          const fresh = await listShelvesAction();
          setShelves(fresh.shelves);
          setItems(fresh.items);
        })
        .catch(() => toast.error('Couldn’t save that', 'Check your connection and try again.'));
    },
    [toast],
  );

  const createFolder = useCallback(
    (name: string, favoriteKeys: string[] = []): string => {
      const id = crypto.randomUUID();
      const trimmed = name.trim();
      setShelves((s) => [...s, { id, name: trimmed, color: null, isPublic: false, sortOrder: s.length }]);
      setItems((it) => [...it, ...favoriteKeys.map((favoriteKey, i) => ({ shelfId: id, favoriteKey, sortOrder: i }))]);
      save(createShelfAction({ id, name: trimmed, favoriteKeys }));
      return id;
    },
    [save],
  );

  const renameFolder = useCallback(
    (id: string, name: string) => {
      setShelves((s) => s.map((x) => (x.id === id ? { ...x, name: name.trim() } : x)));
      save(updateShelfAction(id, { name: name.trim() }));
    },
    [save],
  );

  const setFolderColor = useCallback(
    (id: string, color: AccentSlug | null) => {
      setShelves((s) => s.map((x) => (x.id === id ? { ...x, color } : x)));
      save(updateShelfAction(id, { color }));
    },
    [save],
  );

  /** Public shelves show on your profile, even when favorites are hidden. */
  const setFolderPublic = useCallback(
    (id: string, isPublic: boolean) => {
      setShelves((s) => s.map((x) => (x.id === id ? { ...x, isPublic } : x)));
      save(updateShelfAction(id, { isPublic }));
    },
    [save],
  );

  /** Removes the shelf and its links; the favorites themselves stay. */
  const deleteFolder = useCallback(
    (id: string) => {
      setShelves((s) => s.filter((x) => x.id !== id));
      setItems((it) => it.filter((i) => i.shelfId !== id));
      save(deleteShelfAction(id));
    },
    [save],
  );

  /** Set exactly which shelves one favorite is on. */
  const setItemFolders = useCallback(
    (favoriteKey: string, shelfIds: string[]) => {
      setItems((it) => [
        ...it.filter((i) => i.favoriteKey !== favoriteKey),
        ...shelfIds.map((shelfId) => ({ shelfId, favoriteKey, sortOrder: Date.now() })),
      ]);
      save(setItemShelvesAction(favoriteKey, shelfIds));
    },
    [save],
  );

  /** Add favorites to a shelf without touching their other shelves. */
  const addItems = useCallback(
    (favoriteKeys: string[], shelfId: string) => {
      setItems((it) => [
        ...it.filter((i) => !(i.shelfId === shelfId && favoriteKeys.includes(i.favoriteKey))),
        ...favoriteKeys.map((favoriteKey, i) => ({ shelfId, favoriteKey, sortOrder: Date.now() + i })),
      ]);
      save(addToShelfAction(shelfId, favoriteKeys));
    },
    [save],
  );

  const removeFromFolder = useCallback(
    (favoriteKey: string, shelfId: string) => {
      setItems((it) => it.filter((i) => !(i.shelfId === shelfId && i.favoriteKey === favoriteKey)));
      save(removeFromShelfAction(shelfId, [favoriteKey]));
    },
    [save],
  );

  /** Bulk take-off (Select mode inside a shelf): one request. */
  const removeManyFromFolder = useCallback(
    (favoriteKeys: string[], shelfId: string) => {
      setItems((it) => it.filter((i) => !(i.shelfId === shelfId && favoriteKeys.includes(i.favoriteKey))));
      save(removeFromShelfAction(shelfId, favoriteKeys));
    },
    [save],
  );

  /** Local only: an unfavorited title's links are already gone server-side (FK cascade). */
  const forget = useCallback((favoriteKey: string) => {
    setItems((it) => it.filter((i) => i.favoriteKey !== favoriteKey));
  }, []);

  const foldersOf = useCallback(
    (favoriteKey: string) => items.filter((i) => i.favoriteKey === favoriteKey).map((i) => i.shelfId),
    [items],
  );
  const keysIn = useCallback(
    (shelfId: string) =>
      items
        .filter((i) => i.shelfId === shelfId)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((i) => i.favoriteKey),
    [items],
  );

  return {
    folders: [...shelves].sort((a, b) => a.sortOrder - b.sortOrder),
    foldersOf,
    keysIn,
    createFolder,
    renameFolder,
    setFolderColor,
    setFolderPublic,
    deleteFolder,
    setItemFolders,
    addItems,
    removeFromFolder,
    removeManyFromFolder,
    forget,
  };
}

export type FoldersApi = ReturnType<typeof useShelves>;
