'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import { CalendarPlus, Pencil, Plus, X } from 'lucide-react';
import { useToast } from '@/hooks/useToast';
import {
  restoreSeenDateAction,
  restoreWatchedAction,
  unmarkWatchedAction,
} from '@/actions/watched';
import { getProfileWatchedPageAction, type ProfileShowcase } from '@/actions/profile';
import { cn } from '@/lib/cn';
import { buildImageUrl } from '@/lib/tmdb';
import { trackProfile } from '@/client/profileEvents';
import { QuickViewLink } from '@/components/watchly/QuickViewLink';
import { SeenDateEditor, type SeenDateSaved, type SeenDateTarget } from '@/components/watched/SeenDateEditor';
import { LogWatchModal } from '@/components/watched/LogWatchModal';
import { useWatchedKeys } from '@/components/watched/SeenItButton';
import {
  WATCHED_PAGE_SIZE,
  MONTHS_LONG,
  compareWatched,
  seenLabel,
  seenParts,
  seenToInstant,
  type SeenParts,
} from '@/lib/watchedDates';
import type { EnrichedWatched } from '@/services/watched';

// Library > Watched: every watched title as a ticket stub, newest first.
// Dated tickets group by month; "sometime in 2019" ones close their year;
// undated ones wait at the bottom. Owners set the date on a ticket, remove
// it, and get one nudge for a cluster logged on the same day.

/** Per-visit changes, owned by the profile so they survive tab switches. */
export interface WatchedLocal {
  removed: ReadonlySet<string>;
  /** Dates set this visit, shown until the refetched pages carry them. */
  edits: ReadonlyMap<string, Pick<EnrichedWatched, 'watchedAt' | 'precision' | 'confirmed'>>;
  /** Server pages loaded so far; null = just the profile's first page. */
  pages: EnrichedWatched[][] | null;
  /** Past watches logged this visit (the count the server sent is older). */
  added: number;
}
export const EMPTY_WATCHED_LOCAL: WatchedLocal = { removed: new Set(), edits: new Map(), pages: null, added: 0 };

const watchedKey = (w: { mediaType: string; mediaId: string }) => `${w.mediaType}:${w.mediaId}`;
const titleOf = (w: EnrichedWatched) => (w.mediaType === 'movie' ? w.data.title : w.data.name);
const releaseOf = (w: EnrichedWatched) => (w.mediaType === 'movie' ? w.data.releaseDate : w.data.firstAirDate);
const partsOf = (w: EnrichedWatched): SeenParts | null =>
  w.precision === 'unknown' ? null : seenParts(w.watchedAt, w.precision, w.confirmed);

const HINT_KEY = 'watchly.fixDatesHint.dismissed';
const CLUSTER_MIN = 3;

type Group =
  | { kind: 'month' | 'year'; key: string; label: string; items: EnrichedWatched[] }
  | { kind: 'undated'; key: string; label: string; items: EnrichedWatched[] };

export function WatchedTickets({
  showcase,
  owner,
  preview,
  local,
  onLocalChange,
}: {
  showcase: ProfileShowcase;
  owner: boolean;
  preview: boolean;
  local: WatchedLocal;
  onLocalChange: (next: (cur: WatchedLocal) => WatchedLocal) => void;
}) {
  const { overview } = showcase;
  const pid = overview.profile.userId;
  const username = overview.profile.username;
  const toast = useToast();
  const total = overview.profile.stats.watchedCount + local.added - local.removed.size;
  const [editing, setEditing] = useState<SeenDateTarget[] | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hintDismissed, setHintDismissed] = useState(() => {
    try {
      return localStorage.getItem(HINT_KEY) === '1';
    } catch {
      return false;
    }
  });

  const pages = useMemo(() => local.pages ?? [overview.watchedTitles], [local.pages, overview.watchedTitles]);
  // Pages are fixed offsets (a page can come back short if a title fails to load).
  const hasMore = pages.length * WATCHED_PAGE_SIZE < overview.profile.stats.watchedCount + local.added;
  const [logging, setLogging] = useState(false);
  const watchedKeys = useWatchedKeys(owner && logging);

  // Server pages + this visit's edits and removals, in ticket order.
  const visible = useMemo(() => {
    const seen = new Set<string>();
    const out: EnrichedWatched[] = [];
    for (const w of pages.flat()) {
      const key = watchedKey(w);
      if (seen.has(key) || local.removed.has(key)) continue;
      seen.add(key);
      const edit = local.edits.get(key);
      out.push(edit ? { ...w, ...edit } : w);
    }
    return out.sort(compareWatched);
  }, [pages, local.removed, local.edits]);

  const groups = useMemo(() => {
    const out: Group[] = [];
    for (const w of visible) {
      const p = partsOf(w);
      const g: Omit<Group, 'items'> = !p
        ? { kind: 'undated', key: 'undated', label: 'Undated' }
        : p.month === null
          ? { kind: 'year', key: `y${p.year}`, label: `Sometime in ${p.year}` }
          : { kind: 'month', key: `m${p.year}-${p.month}`, label: `${MONTHS_LONG[p.month]} ${p.year}` };
      const last = out[out.length - 1];
      if (last?.key === g.key) last.items.push(w);
      else out.push({ ...g, items: [w] } as Group);
    }
    return out;
  }, [visible]);

  // The newest same-day cluster of logged (never hand-set) dates.
  const cluster = owner ? findCluster(visible) : null;

  // Re-read every loaded page so serials and order come from the server.
  const refetchPages = async () => {
    const editedKeys = [...local.edits.keys()];
    try {
      const fresh = await Promise.all(
        pages.map((_, i) =>
          getProfileWatchedPageAction(username, { asGuest: preview, offset: i * WATCHED_PAGE_SIZE }),
        ),
      );
      onLocalChange((cur) => {
        const edits = new Map(cur.edits);
        for (const k of editedKeys) edits.delete(k);
        return { ...cur, pages: fresh, edits };
      });
    } catch {
      // Keep the local overlay; the next visit reads fresh data.
    }
  };

  const toTarget = (w: EnrichedWatched): SeenDateTarget => {
    const release = releaseOf(w);
    return {
      mediaType: w.mediaType,
      mediaId: w.mediaId,
      title: titleOf(w),
      posterPath: w.data.posterPath,
      releaseDate: release || null,
      current: partsOf(w),
    };
  };

  const applySaved = (s: SeenDateSaved) => {
    const key = `${s.target.mediaType}:${s.target.mediaId}`;
    onLocalChange((cur) => {
      const edits = new Map(cur.edits);
      edits.set(
        key,
        s.parts
          ? { watchedAt: seenToInstant(s.parts), precision: s.parts.month === null ? 'year' : s.parts.day === null ? 'month' : 'day', confirmed: true }
          : { watchedAt: new Date().toISOString(), precision: 'unknown', confirmed: true },
      );
      return { ...cur, edits };
    });
    trackProfile(pid, 'watched_date_edited', key, {
      from: s.target.current ? seenLabel(s.target.current) : null,
      to: s.parts ? seenLabel(s.parts) : null,
      precision: s.parts ? (s.parts.month === null ? 'year' : s.parts.day === null ? 'month' : 'day') : 'unknown',
      batch: editing && editing.length > 1 ? editing.length : 1,
    });
  };

  const onEditorDone = (saves: SeenDateSaved[]) => {
    void refetchPages();
    const id = toast.custom({
      type: 'success',
      variant: 'action',
      title: saves.length === 1 ? 'Date updated' : `${saves.length} dates updated`,
      description: saves.length === 1 ? saves[0].target.title : undefined,
      actionLabel: 'Undo',
      duration: 6000,
      onAction: () => {
        toast.dismiss(id);
        void Promise.all(
          saves.map((s) => restoreSeenDateAction(s.target.mediaType, s.target.mediaId, s.snapshot)),
        ).then(
          () => refetchPages(),
          () => toast.error('Could not undo', 'Please try again.'),
        );
      },
    });
  };

  const setRemovedKey = (key: string, on: boolean) =>
    onLocalChange((cur) => {
      const removed = new Set(cur.removed);
      if (on) removed.add(key);
      else removed.delete(key);
      return { ...cur, removed };
    });

  const remove = async (w: EnrichedWatched) => {
    const key = watchedKey(w);
    const title = titleOf(w);
    setRemovedKey(key, true);
    trackProfile(pid, 'watched_removed', key);
    try {
      const snapshot = await unmarkWatchedAction(w.mediaType, w.mediaId);
      const id = toast.custom({
        type: 'info',
        variant: 'action',
        title: 'Removed from watched',
        description: snapshot.items.length > 0 ? `${title} is back to Watching in your lists.` : title,
        actionLabel: 'Undo',
        duration: 6000,
        onAction: () => {
          toast.dismiss(id);
          setRemovedKey(key, false);
          restoreWatchedAction(w.mediaType, w.mediaId, snapshot).catch(() => {
            setRemovedKey(key, true);
            toast.error('Could not undo', 'Please try again.');
          });
        },
      });
    } catch {
      setRemovedKey(key, false);
      toast.error('Could not remove it', 'Please try again.');
    }
  };

  const showMore = async () => {
    setLoadingMore(true);
    try {
      const next = await getProfileWatchedPageAction(username, { asGuest: preview, offset: pages.length * WATCHED_PAGE_SIZE });
      onLocalChange((cur) => ({ ...cur, pages: [...(cur.pages ?? [overview.watchedTitles]), next] }));
    } catch {
      toast.error('Could not load more tickets', 'Please try again.');
    } finally {
      setLoadingMore(false);
    }
  };

  const dismissHint = () => {
    setHintDismissed(true);
    try {
      localStorage.setItem(HINT_KEY, '1');
    } catch {
      // Per-device convenience only.
    }
  };

  const admitOne = owner && <AdmitOne onClick={() => setLogging(true)} />;
  const logModal = logging && (
    <LogWatchModal
      watchedKeys={watchedKeys}
      onClose={(n) => {
        setLogging(false);
        if (n > 0) {
          onLocalChange((cur) => ({ ...cur, added: cur.added + n }));
          void refetchPages();
        }
      }}
    />
  );

  if (overview.watchedHidden) return <Empty text="Watched list is private." />;
  if (visible.length === 0) {
    return owner ? (
      <div className="flex flex-col gap-4">
        {admitOne}
        <p className="text-sm text-muted-foreground">
          Every title you mark watched, review or finish in a list becomes a ticket here. Start with something you saw before Watchly.
        </p>
        {logModal}
      </div>
    ) : (
      <Empty text="Nothing marked watched yet." />
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {admitOne}
      {groups.map((g) => {
        const hint = !hintDismissed && cluster && g.items.includes(cluster.items[0]) ? cluster : null;
        return (
          <section key={g.key} aria-label={g.label}>
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h3 className="flex items-baseline gap-2">
                <span className={cn('type-kicker', g.kind === 'undated' ? 'text-muted-foreground' : 'text-foreground')}>
                  {g.label}
                </span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {g.items.length} {g.items.length === 1 ? 'ticket' : 'tickets'}
                </span>
              </h3>
              {hint && (
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <button
                    type="button"
                    onClick={() => setEditing(hint.items.map(toTarget))}
                    className="rounded-sm font-medium text-foreground underline decoration-dotted underline-offset-4 transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
                  >
                    {hint.items.length} logged on {hint.label}. Set when you saw them
                  </button>
                  <button
                    type="button"
                    onClick={dismissHint}
                    aria-label="Dismiss"
                    className="rounded-sm p-1 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </p>
              )}
            </div>
            {g.kind === 'undated' && owner && (
              <p className="-mt-1 mb-3 text-xs text-muted-foreground">Add a date to put these in order.</p>
            )}
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {g.items.map((w) => (
                <TicketStub
                  key={watchedKey(w)}
                  w={w}
                  onEditDate={owner ? () => setEditing([toTarget(w)]) : undefined}
                  onRemove={owner ? () => void remove(w) : undefined}
                />
              ))}
            </ul>
          </section>
        );
      })}

      {hasMore && (
        <div className="flex flex-col items-center gap-2">
          <p className="text-xs text-muted-foreground">
            Showing {visible.length} of {total} tickets
          </p>
          <button
            type="button"
            onClick={() => void showMore()}
            disabled={loadingMore}
            className="h-9 rounded-md border border-border px-4 text-sm font-medium transition-colors hover:bg-foreground/5 disabled:opacity-60 cursor-pointer"
          >
            {loadingMore ? 'Loading…' : 'Show more'}
          </button>
        </div>
      )}

      {logModal}
      {editing && (
        <SeenDateEditor
          queue={editing}
          onClose={() => setEditing(null)}
          onSaved={applySaved}
          onDone={onEditorDone}
        />
      )}
    </div>
  );
}

/** The newest same-day cluster of logged (never hand-set) dates, if any. */
function findCluster(list: EnrichedWatched[]): { label: string; items: EnrichedWatched[] } | null {
  const byDay = new Map<string, EnrichedWatched[]>();
  for (const w of list) {
    if (w.confirmed || w.precision !== 'day') continue;
    const label = seenLabel(partsOf(w))!;
    byDay.set(label, [...(byDay.get(label) ?? []), w]);
  }
  for (const [label, items] of byDay) if (items.length >= CLUSTER_MIN) return { label, items };
  return null;
}

/** The blank ticket at the top of your Watched tab: opens Log a watch. */
function AdmitOne({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative flex h-16 w-full items-center gap-4 overflow-hidden rounded-lg border border-dashed border-border px-5 text-left transition-colors hover:border-primary/60 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
    >
      {/* Punched notches, like the stubs below it. */}
      <span aria-hidden className="absolute -left-2 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border border-dashed border-border bg-background" />
      <span aria-hidden className="absolute -right-2 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border border-dashed border-border bg-background" />
      <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground group-hover:text-primary">Admit one</span>
      <span aria-hidden className="h-8 border-l border-dashed border-border" />
      <span className="flex-1 text-sm font-semibold">Log a past watch</span>
      <Plus aria-hidden className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-primary" />
    </button>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">{text}</p>;
}

/**
 * One stub: poster on the torn-off side, a perforated fold, then the ticket
 * face (format/year, serial, title, the date it was seen). Owners get two
 * controls laid over the face, outside the Quick View link: the date (opens
 * the editor) and remove.
 */
function TicketStub({
  w,
  onEditDate,
  onRemove,
}: {
  w: EnrichedWatched;
  onEditDate?: () => void;
  onRemove?: () => void;
}) {
  const title = titleOf(w);
  const release = releaseOf(w);
  const year = release ? release.slice(0, 4) : null;
  const poster = buildImageUrl(w.data.posterPath, 'w185');
  const date = seenLabel(partsOf(w));
  const serial = w.serial === null ? '----' : String(Math.max(w.serial, 1)).padStart(4, '0');
  const dateLine = date ? (
    <>
      Seen <span className="text-foreground">{date}</span>
    </>
  ) : (
    <span>No date</span>
  );

  return (
    <li className="group/stub relative">
      <QuickViewLink
        mediaType={w.mediaType}
        titleId={w.mediaId}
        className="group relative flex h-28 overflow-hidden rounded-lg border border-border bg-card transition-colors hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="relative w-[4.5rem] shrink-0 bg-muted">
          {poster && <Image src={poster} alt="" fill sizes="72px" className="object-cover" />}
        </span>
        {/* The fold: notches punched top and bottom, a perforated line between. */}
        <span aria-hidden className="relative w-0">
          <span className="absolute -left-2 -top-2 h-4 w-4 rounded-full border border-border bg-background" />
          <span className="absolute -bottom-2 -left-2 h-4 w-4 rounded-full border border-border bg-background" />
          <span className="absolute inset-y-3 left-0 border-l border-dashed border-border" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col justify-between px-4 py-3">
          <span className="flex items-center justify-between gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            <span>{w.mediaType === 'movie' ? 'Film' : 'Series'}{year ? ` · ${year}` : ''}</span>
            <span className="tabular-nums">No. {serial}</span>
          </span>
          <span className="line-clamp-2 text-sm font-semibold leading-snug text-foreground group-hover:text-primary">{title}</span>
          {/* Owners get the date as a control over this spot; keep the line's height. */}
          <span
            aria-hidden={onEditDate ? true : undefined}
            className={cn('font-mono text-[10px] uppercase tracking-widest text-muted-foreground', onEditDate && 'invisible')}
          >
            {dateLine}
          </span>
        </span>
      </QuickViewLink>

      {onEditDate && (
        <button
          type="button"
          onClick={onEditDate}
          aria-label={date ? `Change when you saw ${title} (seen ${date})` : `Add when you saw ${title}`}
          className={cn(
            'absolute bottom-2 left-[calc(4.5rem+0.75rem)] z-10 flex items-center gap-1.5 rounded-sm px-1 py-1 font-mono text-[10px] uppercase tracking-widest transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer',
            date ? 'text-muted-foreground hover:text-foreground' : 'text-primary hover:opacity-80',
          )}
        >
          {date ? (
            <>
              <span className="underline decoration-dotted decoration-muted-foreground/60 underline-offset-4">{dateLine}</span>
              <Pencil className="h-3 w-3 opacity-0 transition-opacity group-hover/stub:opacity-100 group-focus-within/stub:opacity-100 [@media(hover:none)]:opacity-100" />
            </>
          ) : (
            <>
              <CalendarPlus className="h-3 w-3" /> Add date
            </>
          )}
        </button>
      )}

      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${title} from watched`}
          title="Remove from watched"
          className="absolute bottom-2 right-2 z-10 rounded-md p-1.5 text-muted-foreground opacity-0 transition hover:bg-foreground/10 hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover/stub:opacity-100 [@media(hover:none)]:opacity-100 cursor-pointer"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </li>
  );
}
