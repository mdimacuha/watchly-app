'use client';

import { useEffect, useMemo, useState } from 'react';
import { useCachedLoad } from '@/client/cachedLoad';
import { Ticket, TicketCheck } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useToast } from '@/hooks/useToast';
import { useAuthStore } from '@/client/stores/auth';
import { trackProfile } from '@/client/profileEvents';
import {
  getWatchOfAction,
  getWatchedKeysAction,
  logWatchAction,
  restoreLogWatchAction,
  restoreSeenDateAction,
  restoreWatchedAction,
  unmarkWatchedAction,
  type WatchOf,
} from '@/actions/watched';
import { SeenDateEditor, type SeenDateSaved, type SeenDateTarget } from '@/components/watched/SeenDateEditor';
import { seenLabel, seenParts, seenToDate, seenToInstant } from '@/lib/watchedDates';
import type { LogWatchSnapshot } from '@/services/watched';

// "Seen it" for a single title (title page, Quick View, search). Unwatched:
// logs it now, then asks when you saw it (Skip keeps today). Watched: shows
// the date and opens the same editor to change it or remove it. One Undo
// puts back everything a tap did, lists included.

type Variant = 'stack' | 'outline' | 'square' | 'icon';

const VARIANT: Record<Variant, string> = {
  stack:
    'w-full h-11 justify-start gap-2.5 px-4 rounded-md border border-border bg-transparent text-sm font-medium text-foreground hover:bg-secondary/60',
  outline: 'h-10 gap-2 px-4 rounded-md border border-border bg-transparent text-sm font-medium text-foreground hover:bg-secondary/60',
  // Icon-only, sized like the favorite heart beside it (Quick View).
  square: 'h-10 w-10 justify-center rounded-md border border-border bg-transparent text-foreground hover:bg-secondary/60',
  icon: 'h-8 w-8 justify-center rounded-full bg-black/60 text-white backdrop-blur-sm hover:bg-black/80',
};

export function SeenItButton({
  mediaType,
  mediaId,
  title,
  posterPath,
  year,
  variant = 'outline',
  knownWatched,
  surface,
  onWatchedChange,
  className,
}: {
  mediaType: 'movie' | 'tv';
  mediaId: string;
  title: string;
  posterPath: string | null;
  year: string | null;
  variant?: Variant;
  /** When the caller already knows (search grid), skip the lookup. */
  knownWatched?: boolean;
  /** Where it was tapped, for analytics. */
  surface: 'title' | 'quick_view' | 'search';
  /** Told when this button logs or removes the watch. */
  onWatchedChange?: (watched: boolean) => void;
  className?: string;
}) {
  const toast = useToast();
  const viewerId = useAuthStore((s) => s.user?.id ?? null);
  const signedIn = useAuthStore((s) => s.status === 'authenticated');
  // undefined = still loading; null = not watched.
  const [watch, setWatch] = useState<WatchOf | undefined>(knownWatched === false ? null : undefined);
  const [watchedHint, setWatchedHint] = useState(knownWatched === true);
  const [editor, setEditor] = useState<{ target: SeenDateTarget; logged: LogWatchSnapshot | null } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (knownWatched !== undefined || !signedIn) return;
    let cancelled = false;
    getWatchOfAction(mediaType, mediaId).then(
      (w) => !cancelled && setWatch(w),
      () => !cancelled && setWatch(null),
    );
    return () => {
      cancelled = true;
    };
  }, [mediaType, mediaId, knownWatched, signedIn]);

  const watched = watch ? true : watch === null ? false : watchedHint;
  const parts = watch && watch.precision !== 'unknown' ? seenParts(watch.watchedAt, watch.precision, watch.confirmed) : null;
  const dateText = watch ? (seenLabel(parts) ?? 'no date') : null;

  const targetFor = (w: WatchOf): SeenDateTarget => ({
    mediaType,
    mediaId,
    title,
    posterPath,
    releaseDate: year ? `${year}-01-01` : null,
    current: w && w.precision !== 'unknown' ? seenParts(w.watchedAt, w.precision, w.confirmed) : null,
  });

  const track = (kind: string, extra: Record<string, unknown> = {}) => {
    if (viewerId) trackProfile(viewerId, kind === 'removed' ? 'watched_removed' : 'watched_logged', `${mediaType}:${mediaId}`, { surface, ...extra });
  };

  const onClick = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (watched) {
        const w = watch ?? (await getWatchOfAction(mediaType, mediaId));
        setWatch(w);
        if (w) setEditor({ target: targetFor(w), logged: null });
        return;
      }
      const res = await logWatchAction(mediaType, mediaId);
      if (!res.ok) {
        toast.error('Could not add it to Watched', res.error);
        return;
      }
      setWatch(res.watch);
      onWatchedChange?.(true);
      setEditor({ target: targetFor(res.watch), logged: res.already ? null : res.snapshot });
      if (!res.already) track('logged', { finishedInLists: res.snapshot.items.length });
    } catch {
      toast.error('Something went wrong', 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  // After the editor: one toast for the whole tap (log + date), with one Undo.
  const onEditorClose = (saves: SeenDateSaved[]) => {
    const logged = editor?.logged ?? null;
    setEditor(null);
    const saved = saves[0];
    if (saved) {
      setWatch((w) =>
        saved.parts
          ? { watchedAt: seenToInstant(saved.parts), precision: seenToDate(saved.parts).precision, confirmed: true }
          : { watchedAt: w?.watchedAt ?? new Date().toISOString(), precision: 'unknown', confirmed: true },
      );
    }
    if (!logged && !saved) return;

    const date = saved ? (saved.parts ? seenLabel(saved.parts) : 'no date') : null;
    const lists = logged && logged.items.length > 0 ? ' Marked finished in your lists.' : '';
    const id = toast.custom({
      type: 'success',
      variant: 'action',
      title: logged ? 'Added to Watched' : 'Date updated',
      description: `${title}${date ? ` · seen ${date}` : ''}.${lists}`,
      actionLabel: 'Undo',
      duration: 6000,
      onAction: () => {
        toast.dismiss(id);
        void (async () => {
          try {
            if (saved) await restoreSeenDateAction(mediaType, mediaId, saved.snapshot);
            if (logged) await restoreLogWatchAction(mediaType, mediaId, logged);
            const w = await getWatchOfAction(mediaType, mediaId);
            setWatch(w);
            onWatchedChange?.(!!w);
          } catch {
            toast.error('Could not undo', 'Please try again.');
          }
        })();
      },
    });
  };

  const onRemove = async () => {
    try {
      const snapshot = await unmarkWatchedAction(mediaType, mediaId);
      setWatch(null);
      setWatchedHint(false);
      onWatchedChange?.(false);
      track('removed', {});
      const id = toast.custom({
        type: 'info',
        variant: 'action',
        title: 'Removed from Watched',
        description: snapshot.items.length > 0 ? `${title} is back to Watching in your lists.` : title,
        actionLabel: 'Undo',
        duration: 6000,
        onAction: () => {
          toast.dismiss(id);
          restoreWatchedAction(mediaType, mediaId, snapshot).then(
            async () => {
              const w = await getWatchOfAction(mediaType, mediaId);
              setWatch(w);
              onWatchedChange?.(!!w);
            },
            () => toast.error('Could not undo', 'Please try again.'),
          );
        },
      });
    } catch {
      toast.error('Could not remove it', 'Please try again.');
    }
  };

  // Signed-out visitors (search is public) get nothing to tap.
  if (!signedIn) return null;

  const Icon = watched ? TicketCheck : Ticket;
  const label = watched
    ? `Seen ${title}${dateText ? ` (${dateText})` : ''}. Change when you saw it`
    : `Seen ${title}? Add it to Watched`;

  return (
    <>
      <button
        type="button"
        onClick={() => void onClick()}
        disabled={busy || (watch === undefined && knownWatched === undefined)}
        aria-label={label}
        title={
          variant === 'icon' || variant === 'square'
            ? watched
              ? `Seen${parts ? ` ${seenLabel(parts)}` : ''}. Change the date`
              : 'Seen it'
            : undefined
        }
        className={cn(
          'inline-flex shrink-0 items-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 cursor-pointer',
          VARIANT[variant],
          watched && variant !== 'icon' && 'border-primary/50',
          // On posters, a filled accent disc reads as "seen" at a glance.
          watched && variant === 'icon' && 'bg-primary text-primary-foreground hover:bg-primary/90',
          className,
        )}
      >
        <Icon className={cn('h-4 w-4', watched && variant !== 'icon' && 'text-primary')} />
        {(variant === 'stack' || variant === 'outline') && (
          <span className="truncate">
            {watched ? 'Seen' : 'Seen it'}
            {/* "Seen in 2011" / "Seen Mar 2019"; undated reads just "Seen". */}
            {watched && parts && <span className="text-muted-foreground"> {seenLabel(parts)}</span>}
          </span>
        )}
      </button>
      {editor && (
        <SeenDateEditor
          queue={[editor.target]}
          heading={editor.logged ? 'Added to Watched' : undefined}
          cancelLabel={editor.logged ? 'Skip' : 'Cancel'}
          onRemove={editor.logged ? undefined : () => void onRemove()}
          onClose={onEditorClose}
        />
      )}
    </>
  );
}

/** The viewer's watched titles as a Set of `${type}:${id}`, shared by every caller on the page. Null until loaded. */
export function useWatchedKeys(enabled: boolean): ReadonlySet<string> | null {
  const { data } = useCachedLoad('watched-keys', getWatchedKeysAction, enabled);
  return useMemo(() => (data ? new Set(data) : null), [data]);
}
