'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowUpRight, Bookmark, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/ui/user-avatar';
import { ErrorState } from '@/components/watchly/ErrorState';
import { SkeletonBox } from '@/components/watchly/skeletons';
import { QuickViewLink } from '@/components/watchly/QuickViewLink';
import { ViewAllDivider } from '@/components/watchly/ViewAllDivider';
import { VerifiedBadge } from '@/components/profile/VerifiedBadge';
import { STATUS_META, STATUS_ORDER } from '@/components/watchlists/StatusChip';
import { getWatchlistQuickLookAction } from '@/actions/watchlists';
import { isVerifiedAccount } from '@/constants/verifiedAccounts';
import { buildImageUrl } from '@/lib/tmdb';
import { formatRelativeAgo } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { WatchlistQuickLook } from '@/services/watchlists/quickLook';

/** Rows shown before "View all". */
const COLLAPSED_ROWS = 5;

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'unavailable' }
  | { kind: 'ready'; data: WatchlistQuickLook };

/**
 * Watchlist preview inside the global Quick View: who made it, how far
 * through it they are, and the top of the list. Each title row opens that
 * title's Quick View in place; "Go to Page" leaves for the full list.
 */
export function WatchlistQuickViewContent({
  id,
  onClose,
  closeButton,
}: {
  id: string;
  onClose: () => void;
  closeButton: ReactNode;
}) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [nonce, setNonce] = useState(0);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let active = true;
    getWatchlistQuickLookAction(id)
      .then((res) => {
        if (!active) return;
        setState(res.status === 'ok' ? { kind: 'ready', data: res.data } : { kind: 'unavailable' });
      })
      .catch(() => {
        if (active) setState({ kind: 'error' });
      });
    return () => {
      active = false;
    };
  }, [id, nonce]);

  if (state.kind === 'loading') {
    return (
      <div className="relative">
        {closeButton}
        <SkeletonBox className="aspect-[16/7] w-full rounded-none" />
        <div className="p-5 sm:p-6 flex flex-col gap-5">
          <div className="flex gap-4">
            <SkeletonBox className="-mt-16 w-24 sm:w-28 shrink-0 aspect-[2/3] rounded-lg" />
            <div className="flex-1 min-w-0 flex flex-col gap-3 pt-1">
              <SkeletonBox className="h-6 w-2/3" />
              <SkeletonBox className="h-4 w-1/3" />
              <SkeletonBox className="h-4 w-1/2" />
            </div>
          </div>
          <SkeletonBox className="h-3 w-full" />
          <SkeletonBox className="h-48 w-full" />
        </div>
      </div>
    );
  }

  if (state.kind !== 'ready') {
    const unavailable = state.kind === 'unavailable';
    return (
      <div className="relative pt-10">
        {closeButton}
        <ErrorState
          title={unavailable ? 'This watchlist is private' : "Couldn't load watchlist"}
          description={
            unavailable
              ? "It may have been made private or removed by its owner."
              : 'Something went wrong loading this watchlist. Please try again.'
          }
          action={
            unavailable ? undefined : (
              <Button
                variant="secondary"
                onClick={() => {
                  setState({ kind: 'loading' });
                  setNonce((n) => n + 1);
                }}
              >
                Try again
              </Button>
            )
          }
        />
      </div>
    );
  }

  const list = state.data;
  const ownerName = list.owner.displayName || list.owner.username;
  const banner = list.items.find((t) => t.backdropPath)?.backdropPath ?? null;
  const bannerUrl = buildImageUrl(banner, 'w780');
  const stack = list.items.filter((t) => t.posterPath).slice(0, 3);
  const rows = expanded ? list.items : list.items.slice(0, COLLAPSED_ROWS);
  const breakdown = STATUS_ORDER.flatMap((s) => {
    const count = list.statusCounts[s] ?? 0;
    return count > 0 ? [{ status: s, count }] : [];
  });

  return (
    <div className="relative">
      {closeButton}

      <div className="relative w-full aspect-[16/7] bg-muted overflow-hidden">
        {bannerUrl ? (
          <Image src={bannerUrl} alt="" fill className="object-cover opacity-60" sizes="(max-width: 640px) 100vw, 672px" />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Bookmark className="h-12 w-12 text-muted-foreground/30" />
          </div>
        )}
        <div className="absolute inset-0 bg-linear-to-t from-background via-background/40 to-transparent" />
      </div>

      <div className="p-5 sm:p-6 flex flex-col gap-5">
        <div className="flex gap-4">
          <PosterStack posters={stack.map((t) => t.posterPath!)} />

          <div className="flex-1 min-w-0 flex flex-col gap-2">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground/80">
              Watchlist
              {!list.isPublic && (
                <span className="inline-flex items-center gap-1 rounded border border-muted-foreground/30 px-1.5 leading-5">
                  <Lock className="h-3 w-3" /> Private
                </span>
              )}
            </p>
            <h2 className="text-h3 text-foreground leading-tight">{list.name}</h2>
            <Link
              href={`/user/${list.owner.username}`}
              onClick={onClose}
              className="group flex w-fit items-center gap-2 text-sm text-muted-foreground"
            >
              <UserAvatar
                avatarUrl={list.owner.avatarUrl}
                firstName={list.owner.firstName}
                lastName={list.owner.lastName}
                size="sm"
              />
              <span>
                by <span className="font-medium text-foreground group-hover:text-primary transition-colors">{ownerName}</span>
              </span>
              {isVerifiedAccount(list.owner.username) && <VerifiedBadge size="sm" />}
            </Link>
            <p className="text-sm text-muted-foreground">
              {list.total} {list.total === 1 ? 'title' : 'titles'} · Updated {formatRelativeAgo(list.updatedAt)}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button asChild variant="secondary" className="gap-2">
            <Link href={`/watchlists/${list.id}`} onClick={onClose}>
              <ArrowUpRight className="w-4 h-4" />
              <span>Go to Page</span>
            </Link>
          </Button>
        </div>

        {list.description && (
          <p className="text-body-regular text-muted-foreground/90 leading-relaxed whitespace-pre-line">{list.description}</p>
        )}

        {breakdown.length > 0 && (
          <section aria-label="Progress" className="flex flex-col gap-2">
            <div className="flex h-2 overflow-hidden rounded-full bg-secondary" aria-hidden>
              {breakdown.map((b) => (
                <span
                  key={b.status}
                  className={STATUS_META[b.status].dotClass}
                  style={{ width: `${(b.count / list.total) * 100}%` }}
                />
              ))}
            </div>
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {breakdown.map((b) => (
                <li key={b.status} className="inline-flex items-center gap-1.5">
                  <span className={cn('h-2 w-2 rounded-full', STATUS_META[b.status].dotClass)} />
                  {STATUS_META[b.status].label}
                  <span className="tabular-nums text-foreground">{b.count}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {list.items.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Nothing on this list yet.
          </p>
        ) : (
          <section aria-label="On the list" className="flex flex-col gap-1">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">On the list</h3>
            <ol className="flex flex-col">
              {rows.map((t) => (
                <li key={t.itemId}>
                  <QuickViewLink
                    mediaType={t.mediaType as 'movie' | 'tv'}
                    titleId={t.tmdbId}
                    className="group flex items-center gap-3 rounded-lg px-2 py-2 -mx-2 hover:bg-secondary/60 transition-colors"
                  >
                    <span className="w-8 shrink-0 text-center text-sm font-semibold tabular-nums text-muted-foreground">
                      {t.rank ?? <span className="text-[10px] font-semibold uppercase tracking-wide text-primary">New</span>}
                    </span>
                    <span className="relative h-15 w-10 shrink-0 overflow-hidden rounded bg-muted">
                      {t.posterPath && (
                        <Image src={buildImageUrl(t.posterPath, 'w92')!} alt="" fill sizes="40px" className="object-cover" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                        {t.title}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {[t.year, t.mediaType === 'tv' ? 'Series' : 'Movie'].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <span className="hidden shrink-0 items-center gap-1.5 text-xs text-muted-foreground sm:inline-flex">
                      <span className={cn('h-2 w-2 rounded-full', STATUS_META[t.status].dotClass)} />
                      {STATUS_META[t.status].label}
                    </span>
                  </QuickViewLink>
                </li>
              ))}
            </ol>
            {list.items.length > COLLAPSED_ROWS && (
              <ViewAllDivider expanded={expanded} total={list.total} onToggle={() => setExpanded((v) => !v)} />
            )}
            {expanded && list.total > list.items.length && (
              <Link
                href={`/watchlists/${list.id}`}
                onClick={onClose}
                className="self-center text-sm text-primary hover:underline"
              >
                See all {list.total} on the list page
              </Link>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

/** Up to three posters fanned like a stack of tickets, overlapping the banner. */
function PosterStack({ posters }: { posters: string[] }) {
  if (posters.length === 0) {
    return (
      <div className="-mt-16 flex w-24 sm:w-28 shrink-0 aspect-[2/3] items-center justify-center rounded-lg border border-border/40 bg-muted shadow-xl">
        <Bookmark className="h-8 w-8 text-muted-foreground/40" />
      </div>
    );
  }
  return (
    <div className="relative -mt-16 w-24 sm:w-28 shrink-0 aspect-[2/3]">
      {posters
        .map((path, i) => ({ path, i }))
        .reverse()
        .map(({ path, i }) => (
          <div
            key={path}
            className={cn(
              'absolute inset-0 overflow-hidden rounded-lg border border-border/40 bg-muted shadow-xl',
              i === 1 && 'translate-x-2 -translate-y-1 rotate-3 opacity-80',
              i === 2 && 'translate-x-4 -translate-y-2 rotate-6 opacity-60',
            )}
          >
            <Image src={buildImageUrl(path, 'w342')!} alt="" fill sizes="112px" className="object-cover" />
          </div>
        ))}
    </div>
  );
}
