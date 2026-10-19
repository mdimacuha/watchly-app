'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { ArrowUp, ArrowDown, Crown, Search, X } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { buildImageUrl } from '@/lib/tmdb';
import { useToast } from '@/hooks/useToast';
import { getFeatureCandidatesAction, saveFeaturedTitlesAction } from '@/actions/profile';
import type { InsightTitle } from '@/services/profile/insights';
import type { FeatureCandidate } from '@/services/profile/featured';

const MAX = 6;
const keyOf = (t: InsightTitle) => `${t.mediaType}:${t.tmdbId}`;

/**
 * Owner's editor for Feature presentation: up to 6 titles from their
 * favorites and watchlists, in order (#1 gets the crown). Posters live only
 * in the grid; the lineup is a ranked list (desktop: a rail beside the grid;
 * phones: a strip of thumbnails that opens the list). One scroll area, Save
 * pinned. Saving an empty lineup returns to the automatic ranking.
 */
export function FeaturePicker({
  initial,
  onClose,
  onSaved,
}: {
  initial: InsightTitle[];
  onClose: () => void;
  onSaved: (titles: InsightTitle[]) => void;
}) {
  const toast = useToast();
  const [lineup, setLineup] = useState<InsightTitle[]>(initial);
  const [candidates, setCandidates] = useState<FeatureCandidate[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState('');
  const [source, setSource] = useState('all');
  const [saving, setSaving] = useState(false);
  // Phones: the grid or the ranked list ("Edit order").
  const [orderOpen, setOrderOpen] = useState(false);
  const [fullHint, setFullHint] = useState(false);
  const [announce, setAnnounce] = useState('');
  // Focus target after a move/remove: a row index in the list.
  const focusRow = useRef<number | null>(null);
  const listRef = useRef<HTMLOListElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    getFeatureCandidatesAction()
      .then((c) => {
        if (!cancelled) setCandidates(c);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  // Keep keyboard focus on the moved/next row after the list re-renders.
  useEffect(() => {
    if (focusRow.current === null) return;
    const rows = listRef.current?.querySelectorAll<HTMLElement>('[data-row-focus]');
    rows?.[Math.min(focusRow.current, rows.length - 1)]?.focus();
    focusRow.current = null;
  }, [lineup]);

  const sources = useMemo(() => {
    const names = new Set<string>();
    for (const c of candidates ?? []) for (const s of c.sources) names.add(s);
    const lists = [...names].filter((n) => n !== 'Favorite').sort((a, b) => a.localeCompare(b));
    return [...(names.has('Favorite') ? ['Favorite'] : []), ...lists];
  }, [candidates]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (candidates ?? []).filter(
      (c) => (source === 'all' || c.sources.includes(source)) && (!q || c.title.toLowerCase().includes(q)),
    );
  }, [candidates, query, source]);

  const meta = useMemo(() => new Map((candidates ?? []).map((c) => [keyOf(c), c])), [candidates]);
  const position = (t: InsightTitle) => lineup.findIndex((x) => keyOf(x) === keyOf(t));

  const toggle = (t: InsightTitle) => {
    const i = position(t);
    if (i >= 0) {
      setLineup(lineup.filter((_, j) => j !== i));
      setAnnounce(`${t.title} removed`);
      setFullHint(false);
    } else if (lineup.length >= MAX) {
      setFullHint(true);
    } else {
      setLineup([...lineup, t]);
      setAnnounce(`${t.title} added at #${lineup.length + 1}`);
    }
  };
  const removeAt = (i: number) => {
    const t = lineup[i];
    focusRow.current = i;
    setLineup(lineup.filter((_, j) => j !== i));
    setAnnounce(`${t.title} removed`);
    setFullHint(false);
  };
  const moveTo = (i: number, to: number) => {
    if (to < 0 || to >= lineup.length || to === i) return;
    const next = [...lineup];
    const [t] = next.splice(i, 1);
    next.splice(to, 0, t);
    focusRow.current = to;
    setLineup(next);
    setAnnounce(`${t.title} moved to #${to + 1}`);
  };

  const save = async (titles: InsightTitle[]) => {
    setSaving(true);
    const res = await saveFeaturedTitlesAction(
      titles.map((t) => ({ mediaType: t.mediaType, mediaId: String(t.tmdbId) })),
    ).catch(() => ({ ok: false as const, error: 'Please try again.' }));
    setSaving(false);
    if (!res.ok) {
      toast.error('Could not save', res.error);
      return;
    }
    onSaved(titles);
    onClose();
  };

  // ---- Ranked list (desktop rail; phones via "Edit order") ----------------
  const lineupList = (
    <ol ref={listRef} className="flex flex-col gap-1.5" aria-label="Your lineup">
      {Array.from({ length: MAX }).map((_, i) => {
        const t = lineup[i];
        if (!t) {
          return (
            <li
              key={`empty-${i}`}
              className="flex h-16 items-center gap-3 rounded-md border border-dashed border-border px-3 text-xs text-muted-foreground"
            >
              <span className="w-5 text-center font-mono tabular-nums">{i + 1}</span>
              Pick a title
            </li>
          );
        }
        const m = meta.get(keyOf(t));
        return (
          <li
            key={keyOf(t)}
            data-row-focus
            tabIndex={-1}
            onKeyDown={(e) => {
              if (!e.altKey) return;
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                moveTo(i, i - 1);
              } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                moveTo(i, i + 1);
              }
            }}
            className="flex h-16 items-center gap-3 rounded-md bg-secondary/60 pl-3 pr-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="flex w-5 shrink-0 justify-center font-mono text-xs tabular-nums text-muted-foreground">
              {i === 0 ? <Crown className="h-4 w-4 text-primary" aria-label="Number 1" /> : i + 1}
            </span>
            <span className="relative h-[52px] w-[35px] shrink-0 overflow-hidden rounded-sm bg-muted">
              {t.posterPath && (
                <Image src={buildImageUrl(t.posterPath, 'w92')!} alt="" fill sizes="36px" className="object-cover" />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="line-clamp-2 text-sm font-medium leading-tight text-foreground">{t.title}</span>
              <span className="block truncate text-[11px] text-muted-foreground">
                {[t.year, m?.sources.join(', ')].filter(Boolean).join(' · ')}
              </span>
            </span>
            <span className="flex shrink-0 items-center">
              <RowButton label={`Move ${t.title} up`} onClick={() => moveTo(i, i - 1)} disabled={i === 0}>
                <ArrowUp className="h-4 w-4" />
              </RowButton>
              <RowButton label={`Move ${t.title} down`} onClick={() => moveTo(i, i + 1)} disabled={i === lineup.length - 1}>
                <ArrowDown className="h-4 w-4" />
              </RowButton>
              <RowButton label={`Remove ${t.title}`} onClick={() => removeAt(i)}>
                <X className="h-4 w-4" />
              </RowButton>
            </span>
          </li>
        );
      })}
    </ol>
  );

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Feature presentation"
      className="max-w-4xl gap-1 px-5 pt-5 sm:px-6 sm:pt-6"
      bodyClassName="flex flex-col"
    >
      <p className="pr-8 text-sm text-muted-foreground">
        Pick up to {MAX} from your favorites and watchlists. #1 gets the crown.
      </p>
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>

      {/* Desktop: a fixed-height two-pane area; only the grid scrolls. */}
      <div className="mt-4 flex flex-1 flex-col md:grid md:h-[min(64dvh,580px)] md:flex-none md:grid-cols-[300px_minmax(0,1fr)] md:gap-6">
        {/* Desktop rail */}
        <aside className="hidden md:flex md:flex-col md:gap-2" aria-label="Lineup">
          <p className="type-kicker text-muted-foreground">
            Lineup · {lineup.length}/{MAX}
          </p>
          {lineupList}
        </aside>

        <div className="flex min-w-0 flex-col md:min-h-0">
          {/* Phones: lineup strip + search, pinned while the grid scrolls. */}
          <div className="sticky top-0 z-10 flex flex-col gap-3 bg-background pb-3 md:static md:pb-3">
            <div className="flex items-center gap-3 md:hidden">
              <ol className="flex flex-1 gap-1.5" aria-label="Your lineup">
                {Array.from({ length: MAX }).map((_, i) => {
                  const t = lineup[i];
                  return (
                    <li key={t ? keyOf(t) : `strip-${i}`} className="flex-1">
                      <button
                        type="button"
                        onClick={() => setOrderOpen(true)}
                        aria-label={t ? `#${i + 1} ${t.title}. Edit order` : `Slot ${i + 1} empty`}
                        className={cn(
                          'relative block aspect-2/3 w-full overflow-hidden rounded-sm cursor-pointer',
                          t ? 'bg-muted' : 'border border-dashed border-border',
                        )}
                      >
                        {t?.posterPath && (
                          <Image src={buildImageUrl(t.posterPath, 'w92')!} alt="" fill sizes="48px" className="object-cover" />
                        )}
                        <span className="absolute left-0.5 top-0.5 rounded-sm bg-background/90 px-1 font-mono text-[9px] tabular-nums text-foreground">
                          {i + 1}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
              <button
                type="button"
                onClick={() => setOrderOpen((v) => !v)}
                aria-expanded={orderOpen}
                className="shrink-0 rounded-md border border-border px-2.5 py-2 text-xs font-medium hover:bg-secondary cursor-pointer"
              >
                {orderOpen ? 'Done' : 'Edit order'}
              </button>
            </div>

            <div className={cn('flex flex-col gap-3', orderOpen && 'hidden md:flex')}>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search your favorites and lists"
                    aria-label="Search your favorites and lists"
                    className="h-9 w-full rounded-md border border-input bg-transparent pl-9 pr-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>
                {sources.length > 0 && (
                  <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1" role="radiogroup" aria-label="From">
                    {['all', ...sources].map((s) => (
                      <button
                        key={s}
                        type="button"
                        role="radio"
                        aria-checked={source === s}
                        onClick={() => setSource(s)}
                        className={cn(
                          'shrink-0 rounded-full border px-3 py-1 text-xs whitespace-nowrap cursor-pointer',
                          source === s ? 'border-primary bg-primary/15 text-foreground' : 'border-border text-muted-foreground hover:text-foreground',
                        )}
                      >
                        {s === 'all' ? 'All' : s === 'Favorite' ? 'Favorites' : s}
                      </button>
                    ))}
                  </div>
                )}
                {fullHint && (
                  <p className="text-xs text-foreground" role="status">
                    Lineup full: remove one first.
                  </p>
                )}
            </div>
          </div>

          {/* Phones with "Edit order": the ranked list instead of the grid. */}
          {orderOpen && <div className="pb-4 md:hidden">{lineupList}</div>}

          <div className={cn('md:min-h-0 md:flex-1 md:overflow-y-auto md:pr-1', orderOpen && 'hidden md:block')}>
            {failed ? (
              <p className="py-6 text-sm text-muted-foreground">
                Couldn&apos;t load your titles.{' '}
                <button
                  type="button"
                  onClick={() => {
                    setFailed(false);
                    setAttempt((n) => n + 1);
                  }}
                  className="text-primary hover:underline cursor-pointer"
                >
                  Try again
                </button>
              </p>
            ) : candidates === null ? (
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4" aria-busy="true" aria-label="Loading your titles">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div key={i} className="aspect-2/3 rounded-md bg-secondary animate-pulse" />
                ))}
              </div>
            ) : shown.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                {candidates.length === 0 ? 'Favorite a few titles or add them to a watchlist first.' : 'Nothing matches.'}
              </p>
            ) : (
              <ul className="grid grid-cols-3 gap-x-3 gap-y-4 pb-4 sm:grid-cols-4">
                {shown.map((c) => {
                  const i = position(c);
                  const picked = i >= 0;
                  const blocked = !picked && lineup.length >= MAX;
                  return (
                    <li key={keyOf(c)}>
                      <button
                        type="button"
                        onClick={() => toggle(c)}
                        aria-pressed={picked}
                        aria-disabled={blocked}
                        title={blocked ? 'Lineup full: remove one first' : `${c.title} · ${c.sources.join(', ')}`}
                        className={cn(
                          'group relative block aspect-2/3 w-full overflow-hidden rounded-md bg-muted cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          blocked && 'cursor-not-allowed opacity-50',
                        )}
                      >
                        {c.posterPath && (
                          <Image
                            src={buildImageUrl(c.posterPath, 'w185')!}
                            alt=""
                            fill
                            sizes="(min-width: 640px) 120px, 30vw"
                            className={cn('object-cover transition-opacity', picked && 'opacity-70')}
                          />
                        )}
                        {/* Picked: inset outline (never clipped) + its rank. */}
                        {picked && (
                          <>
                            <span className="pointer-events-none absolute inset-0 rounded-md border-2 border-primary" />
                            <span className="absolute right-1.5 top-1.5 flex h-6 min-w-6 items-center justify-center rounded-full bg-primary px-1 text-xs font-bold text-primary-foreground">
                              {i === 0 ? <Crown className="h-3.5 w-3.5" aria-label="Number 1" /> : i + 1}
                            </span>
                          </>
                        )}
                        <span className="sr-only">{c.title}</span>
                      </button>
                      <p className="mt-1.5 line-clamp-2 text-xs leading-snug text-muted-foreground">{c.title}</p>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>

      <div className="sticky bottom-0 z-10 -mx-5 mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-border bg-background px-5 py-4 sm:-mx-6 sm:px-6">
        <button
          type="button"
          onClick={() => save([])}
          disabled={saving}
          className="text-sm text-muted-foreground hover:text-foreground cursor-pointer disabled:opacity-50"
        >
          Use automatic ranking
        </button>
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => save(lineup)} disabled={saving}>
            {saving ? 'Saving…' : `Save lineup${lineup.length ? ` (${lineup.length})` : ''}`}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function RowButton({
  label,
  onClick,
  disabled,
  className,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground cursor-pointer disabled:cursor-default disabled:opacity-25 disabled:hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
    >
      {children}
    </button>
  );
}
