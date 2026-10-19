'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Loader2, Star } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/ui/user-avatar';
import { ConfirmDestructiveModal } from '@/components/ui/ConfirmDestructiveModal';
import { formatRelativeTime } from '@/components/activity/time';
import { useAuthStore } from '@/client/stores/auth';
import { SpoilerText } from '@/components/reviews/SpoilerText';
import type { TitleReview } from '@/services/reviews';
import type { ReviewsState } from './useTitleReviews';

const BODY_MAX = 4000; // mirrors REVIEW_BODY_MAX_LENGTH (server-only module)

// Redesigned Ratings & Reviews: score + rate-in-place on the left, reading
// column on the right. Picking stars opens the composer; no empty form boxes.
export function ReviewsPanel({ state }: { state: ReviewsState }) {
  const isAuthenticated = useAuthStore((s) => s.status === 'authenticated');
  const { status, aggregate, mine, reviews, busy } = state;
  const [draft, setDraft] = useState<{ rating: number; body: string; isSpoiler: boolean } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (status === 'off') return null;

  const startEdit = (rating: number) =>
    setDraft({ rating, body: draft?.body ?? mine?.body ?? '', isSpoiler: draft?.isSpoiler ?? mine?.isSpoiler ?? false });

  const submit = async () => {
    if (!draft) return;
    if (await state.save(draft.rating, draft.body, draft.isSpoiler)) setDraft(null);
  };

  const hasScore = !!aggregate && aggregate.count > 0 && !!aggregate.average;
  const shownRating = draft?.rating ?? mine?.rating ?? 0;

  return (
    <section id="reviews" aria-labelledby="reviews-heading" className="scroll-mt-6 flex flex-col gap-5">
      <h2 id="reviews-heading" className="text-lg font-bold tracking-tight text-foreground">
        Ratings &amp; Reviews
      </h2>

      {status === 'loading' && <div className="h-40 rounded-md bg-card animate-pulse" aria-busy="true" />}

      {status === 'error' && (
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          Couldn&apos;t load reviews.
          <button onClick={() => void state.load()} className="font-semibold text-foreground underline underline-offset-4">
            Try again
          </button>
        </div>
      )}

      {status === 'ready' && (
        <div className="grid gap-8 lg:grid-cols-[240px_minmax(0,1fr)]">
          {/* Score + your rating */}
          <div className="flex flex-col gap-5 lg:border-r lg:border-border lg:pr-8">
            {hasScore ? (
              <div className="flex flex-col gap-1.5">
                <p className="leading-none">
                  <span className="text-6xl font-bold tracking-tight text-foreground">{aggregate!.average!.toFixed(1)}</span>
                  <span className="text-lg text-muted-foreground">/5</span>
                </p>
                <Stars value={aggregate!.average!} />
                <p className="text-xs text-muted-foreground">
                  Watchly score · {aggregate!.count} {aggregate!.count === 1 ? 'rating' : 'ratings'}
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No Watchly ratings yet.</p>
            )}

            <div className="flex flex-col gap-2 border-t border-border pt-4">
              <p className="type-kicker text-muted-foreground">{mine ? 'Your rating' : 'Rate it'}</p>
              {isAuthenticated ? (
                <StarPicker value={shownRating} onChange={startEdit} disabled={busy} />
              ) : (
                <p className="text-sm text-muted-foreground">
                  <Link href="/signin" className="text-foreground underline underline-offset-4">Sign in</Link> to rate and review.
                </p>
              )}
            </div>
          </div>

          {/* Composer, your review, community */}
          <div className="flex flex-col gap-6 min-w-0">
            {draft && (
              <div className="flex flex-col gap-3">
                <label htmlFor="review-body-v" className="text-sm font-semibold text-foreground">
                  {mine ? 'Edit your review' : 'Add a few words'} <span className="font-normal text-muted-foreground">(optional)</span>
                </label>
                <textarea
                  id="review-body-v"
                  autoFocus
                  value={draft.body}
                  maxLength={BODY_MAX}
                  onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                  rows={4}
                  placeholder="What stayed with you?"
                  className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y"
                />
                <label className="flex w-fit items-center gap-2 text-sm text-muted-foreground cursor-pointer hover:text-foreground">
                  <input
                    type="checkbox"
                    checked={draft.isSpoiler}
                    disabled={!draft.body.trim()}
                    onChange={(e) => setDraft({ ...draft, isSpoiler: e.target.checked })}
                    className="h-4 w-4 accent-primary disabled:cursor-not-allowed"
                  />
                  Contains spoilers
                  <span className="text-xs">(hidden until readers choose to see it)</span>
                </label>
                <div className="flex items-center gap-2">
                  <Button onClick={submit} disabled={busy} size="sm">
                    {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                    Save {draft.rating}★
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setDraft(null)} disabled={busy}>
                    Cancel
                  </Button>
                  <span className="ml-auto text-xs text-muted-foreground">{draft.body.length}/{BODY_MAX}</span>
                </div>
              </div>
            )}

            {!draft && mine && (
              <div className="border-l-2 border-primary pl-4 flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">Your review</span>
                  <Stars value={mine.rating} small />
                  {mine.body && mine.isSpoiler && (
                    <span className="rounded-sm border border-border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Spoiler</span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground whitespace-pre-line">{mine.body || 'Rating only.'}</p>
                <div className="flex gap-4 text-xs">
                  <button onClick={() => startEdit(mine.rating)} className="font-semibold text-foreground hover:underline">Edit</button>
                  <button onClick={() => setConfirmOpen(true)} className="text-muted-foreground hover:text-foreground">Delete</button>
                </div>
              </div>
            )}

            {reviews.length > 0 ? (
              <ul className="flex flex-col divide-y divide-border border-t border-border">
                {reviews.map((r) => <ReviewRow key={r.id} review={r} />)}
              </ul>
            ) : (
              !draft && <p className="text-sm text-muted-foreground">No written reviews yet.</p>
            )}
          </div>
        </div>
      )}

      <ConfirmDestructiveModal
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Delete your review?"
        description="This removes your rating and written review for this title. You can always add a new one later."
        confirmLabel="Delete review"
        onConfirm={state.remove}
      />
    </section>
  );
}

function ReviewRow({ review }: { review: TitleReview }) {
  const a = review.author;
  const name = a.displayName || `${a.firstName ?? ''} ${a.lastName ?? ''}`.trim() || a.username;
  const href = `/user/${a.username}`;
  return (
    <li className="flex gap-3 py-4">
      <UserAvatar href={href} avatarUrl={a.avatarUrl ?? undefined} firstName={a.firstName ?? undefined} lastName={a.lastName ?? undefined} size="sm" className="shrink-0" />
      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          <Link href={href} className="text-sm font-semibold text-foreground hover:text-primary">{name}</Link>
          <Stars value={review.rating} small />
          <span>{formatRelativeTime(review.updatedAt)}</span>
        </div>
        <SpoilerText text={review.body} isSpoiler={review.isSpoiler} className="text-sm leading-relaxed text-muted-foreground" />
      </div>
    </li>
  );
}

function Stars({ value, small }: { value: number; small?: boolean }) {
  const pct = Math.max(0, Math.min(1, value / 5)) * 100;
  const size = small ? 'w-3 h-3' : 'w-4 h-4';
  return (
    <span className="relative inline-flex" role="img" aria-label={`${value} out of 5`}>
      <span className="flex text-muted-foreground/30">
        {[0, 1, 2, 3, 4].map((i) => <Star key={i} className={size} />)}
      </span>
      <span className="absolute inset-0 flex overflow-hidden text-primary" style={{ width: `${pct}%` }}>
        {[0, 1, 2, 3, 4].map((i) => <Star key={i} className={cn(size, 'shrink-0 fill-current')} />)}
      </span>
    </span>
  );
}

const STAR_PX = 28; // w-6 icon + p-0.5 on each side

/**
 * Half-star picker as one slider: the left/right half of each star picks
 * n-0.5 / n; arrow keys step by 0.5 and Enter commits.
 */
function StarPicker({ value, onChange, disabled }: { value: number; onChange: (n: number) => void; disabled?: boolean }) {
  const [hover, setHover] = useState(0);
  const [keyed, setKeyed] = useState<number | null>(null);
  const shown = hover || keyed || value;

  const fromPointer = (e: React.MouseEvent<HTMLDivElement>) => {
    const x = e.clientX - e.currentTarget.getBoundingClientRect().left;
    return Math.min(5, Math.max(0.5, Math.ceil((x / STAR_PX) * 2) / 2));
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const cur = keyed ?? (value || 0);
    const next =
      e.key === 'ArrowRight' || e.key === 'ArrowUp' ? Math.min(5, cur + 0.5)
      : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? Math.max(0.5, cur - 0.5)
      : e.key === 'Home' ? 0.5
      : e.key === 'End' ? 5
      : null;
    if (next !== null) {
      e.preventDefault();
      setKeyed(next);
    } else if ((e.key === 'Enter' || e.key === ' ') && keyed) {
      e.preventDefault();
      onChange(keyed);
      setKeyed(null);
    }
  };

  return (
    <div
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label="Your rating"
      aria-valuemin={0.5}
      aria-valuemax={5}
      aria-valuenow={shown || undefined}
      aria-valuetext={shown ? `${shown} out of 5 stars` : 'Not rated'}
      aria-disabled={disabled}
      onPointerMove={(e) => !disabled && setHover(fromPointer(e))}
      onPointerLeave={() => setHover(0)}
      onClick={(e) => !disabled && onChange(fromPointer(e))}
      onKeyDown={onKeyDown}
      onBlur={() => setKeyed(null)}
      className={cn(
        'flex w-fit cursor-pointer select-none items-center rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const fill = Math.max(0, Math.min(1, shown - (n - 1))); // 0, 0.5 or 1
        return (
          <span key={n} className="relative p-0.5" aria-hidden>
            <Star className="w-6 h-6 text-muted-foreground/40" />
            <span className="absolute inset-0.5 overflow-hidden text-primary" style={{ width: `${fill * 24}px` }}>
              <Star className="w-6 h-6 fill-current" />
            </span>
          </span>
        );
      })}
      {shown > 0 && <span className="ml-2 font-mono text-xs text-muted-foreground">{shown.toFixed(1)}</span>}
    </div>
  );
}
