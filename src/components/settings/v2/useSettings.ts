'use client';

import { useState } from 'react';
import { useToast } from '@/hooks/useToast';
import {
  getVisitorPreviewAction,
  revokeOtherSessionsAction,
  revokeSessionAction,
  unblockUserAction,
  updatePrivacyAction,
} from '@/actions/settings';
import { updateShelfAction } from '@/actions/favorites';
import type { SettingsSnapshot } from '@/services/settings/snapshot';

// Shared state + saves for every Settings layout (A/B/C). Each change is
// optimistic, rolls back with a toast on failure, and re-reads the visitor
// preview from the server (the same rules the public profile uses), so the
// preview never guesses on the client.

export type Privacy = SettingsSnapshot['privacy'];

export function useSettings(snapshot: SettingsSnapshot) {
  const toast = useToast();
  const [privacy, setPrivacy] = useState(snapshot.privacy);
  const [preview, setPreview] = useState(snapshot.preview);
  const [shelves, setShelves] = useState(snapshot.shelves);
  const [blocked, setBlocked] = useState(snapshot.blocked);
  const [sessions, setSessions] = useState(snapshot.sessions);
  const [previewLoading, setPreviewLoading] = useState(false);

  const refreshPreview = async () => {
    setPreviewLoading(true);
    try {
      setPreview(await getVisitorPreviewAction());
    } catch {
      // Keep the last preview; the controls still show the saved state.
    } finally {
      setPreviewLoading(false);
    }
  };

  const updatePrivacy = async (patch: Partial<Privacy>) => {
    const before = privacy;
    setPrivacy({ ...privacy, ...patch });
    try {
      await updatePrivacyAction(patch);
      await refreshPreview();
    } catch {
      setPrivacy(before);
      toast.error('Could not save', 'Your privacy setting was not changed. Please try again.');
    }
  };

  const setShelfPublic = async (id: string, isPublic: boolean) => {
    const before = shelves;
    setShelves(shelves.map((s) => (s.id === id ? { ...s, isPublic } : s)));
    const res = await updateShelfAction(id, { isPublic }).catch(() => ({ ok: false as const, error: 'Please try again.' }));
    if (!res.ok) {
      setShelves(before);
      toast.error('Could not save', res.error);
      return;
    }
    await refreshPreview();
  };

  const unblock = async (id: string) => {
    const before = blocked;
    setBlocked(blocked.filter((b) => b.id !== id));
    const res = await unblockUserAction(id).catch(() => ({ ok: false as const, error: 'Please try again.' }));
    if (!res.ok) {
      setBlocked(before);
      toast.error('Could not unblock', res.error);
    }
  };

  const signOutSession = async (id: string) => {
    const before = sessions;
    setSessions(sessions.filter((s) => s.id !== id));
    const res = await revokeSessionAction(id).catch(() => ({ ok: false as const, error: 'Please try again.' }));
    if (!res.ok) {
      setSessions(before);
      toast.error('Could not sign that device out', res.error);
    }
  };

  const signOutOthers = async () => {
    const before = sessions;
    setSessions(sessions.filter((s) => s.current));
    const res = await revokeOtherSessionsAction().catch(() => ({ ok: false as const, error: 'Please try again.' }));
    if (!res.ok) {
      setSessions(before);
      toast.error('Could not sign other devices out', res.error);
    } else {
      toast.success('Signed out everywhere else', 'Only this device is still signed in.');
    }
  };

  return {
    snapshot,
    privacy,
    updatePrivacy,
    preview,
    previewLoading,
    shelves,
    setShelfPublic,
    blocked,
    unblock,
    sessions,
    signOutSession,
    signOutOthers,
  };
}

export type SettingsState = ReturnType<typeof useSettings>;
