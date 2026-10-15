'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Star, MessageSquare, Loader2, Trash2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/ui/user-avatar';
import { ErrorState } from '@/components/watchly/ErrorState';
import { SkeletonBox } from '@/components/watchly/skeletons';
import { ConfirmDestructiveModal } from '@/components/ui/ConfirmDestructiveModal';
import { formatRelativeTime } from '@/components/activity/time';
import { useToast } from '@/hooks/useToast';
import {
  getReviewsForTitleAction,
  saveReviewAction,
  deleteReviewAction,
} from '@/actions/reviews';
// Type-only import — fully erased at build, so the `server-only` review
// service is never pulled into this client bundle.
import type {
  ReviewAggregate,
  UserReview,
  TitleReview,
} from '@/services/reviews';

// Kept in sync with REVIEW_BODY_MAX_LENGTH in @/services/reviews (that value
// lives in a server-only module and can't be imported into a client bundle).
const REVIEW_BODY_MAX = 4000;

interface ReviewsSectionProps {
  mediaType: 'movie' | 'tv';
  id: string;
  isAuthenticated: boolean;
}

type LoadStatus = 'loading' | 'ready' | 'error';

// ---------------------------------------------------------------------------
// Star display (aggregate) — precise fractional fill via a clipped overlay.
// ---------------------------------------------------------------------------

function StarDisplay({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(1, value / 5)) * 100;
  return (
    <div
      className={cn('relative inline-flex', className)}
      aria-hidden="true"
    >
      <div className="flex text-muted-foreground/30">
        {[0, 1, 2, 3, 4].map((i) => (
          <Star key={i} className="w-4 h-4" />
        ))}
      </div>
      <div
        className="absolute inset-0 flex overflow-hidden text-primary"
        style={{ width: `${pct}%` }}
      >
        {[0, 1, 2, 3, 4].map((i) => (
          <Star key={i} className="w-4 h-4 shrink-0 fill-current" />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Star picker (interactive) — five focusable buttons.
// ---------------------------------------------------------------------------

function StarPicker({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (rating: number) => void;
  disabled?: boolean;
}) {
  const [hover, setHover] = useState(0);
  const active = hover || value;

  return (
    <div
      className="flex items-center gap-1"
      role="group"
      aria-label="Your rating"
      onMouseLeave={() => setHover(0)}
    >
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = star <= active;
        return (
          <button
            key={star}
            type="button"
            disabled={disabled}
            aria-label={`${star} ${star === 1 ? 'star' : 'stars'}`}
            aria-pressed={star === value}
            onMouseEnter={() => setHover(star)}
            onFocus={() => setHover(star)}
            onBlur={() => setHover(0)}
            onClick={() => onChange(star)}
            className={cn(
              'rounded-md p-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50',
              filled ? 'text-primary' : 'text-muted-foreground/40 hover:text-muted-foreground',
            )}
          >
            <Star className={cn('w-8 h-8', filled && 'fill-current')} />
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Community review list item
// ---------------------------------------------------------------------------

function authorDisplayName(a: TitleReview['author']): string {
  return (
    a.displayName ||
    `${a.firstName ?? ''} ${a.lastName ?? ''}`.trim() ||
    a.username
  );
}

function ReviewListItem({ review }: { review: TitleReview }) {
  const name = authorDisplayName(review.author);
  const profileHref = `/user/${review.author.username}`;
  return (
    <li className="flex gap-3 rounded-lg border border-border bg-card px-5 py-4">
      <UserAvatar
        href={profileHref}
        avatarUrl={review.author.avatarUrl ?? undefined}
        firstName={review.author.firstName ?? undefined}
        lastName={review.author.lastName ?? undefined}
        size="sm"
        className="shrink-0"
      />
      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Link
            href={profileHref}
            className="text-sm font-semibold text-foreground hover:text-primary transition-colors"
          >
            {name}
          </Link>
          <StarDisplay value={review.rating} />
          <span className="text-meta text-muted-foreground/70">
            {formatRelativeTime(review.updatedAt)}
          </span>
        </div>
        <p className="text-body-regular text-muted-foreground/90 whitespace-pre-line">
          {review.body}
        </p>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Section
// ---------------------------------------------------------------------------

export function ReviewsSection({
  mediaType,
  id,
  isAuthenticated,
}: ReviewsSectionProps) {
  const toast = useToast();

  const [status, setStatus] = useState<LoadStatus>('loading');
  const [aggregate, setAggregate] = useState<ReviewAggregate | null>(null);
  const [mine, setMine] = useState<UserReview | null>(null);
  const [reviews, setReviews] = useState<TitleReview[]>([]);

  const [rating, setRating] = useState(0);
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const {
        aggregate: agg,
        mine: own,
        reviews: list,
      } = await getReviewsForTitleAction(id, mediaType);
      setAggregate(agg);
      setMine(own);
      setReviews(list);
      setRating(own?.rating ?? 0);
      setBody(own?.body ?? '');
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, [id, mediaType]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const handleSave = async () => {
    if (rating < 1) {
      toast.error('Add a rating', 'Pick 1 to 5 stars before saving.');
      return;
    }
    setSaving(true);
    try {
      const result = await saveReviewAction(id, mediaType, { rating, body });
      if (!result.ok) {
        toast.error('Could not save review', result.error);
        return;
      }
      setAggregate(result.aggregate);
      setMine(result.mine);
      setRating(result.mine.rating);
      setBody(result.mine.body ?? '');
      toast.success(
        'Review saved',
        'Your rating has been recorded.',
      );
    } catch {
      toast.error('Could not save review', 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    // Thrown errors are caught + toasted by ConfirmDestructiveModal (which
    // also keeps itself open on failure), so don't toast the error here.
    setDeleting(true);
    try {
      const { aggregate: agg } = await deleteReviewAction(id, mediaType);
      setAggregate(agg);
      setMine(null);
      setRating(0);
      setBody('');
      toast.success('Review removed', 'Your review has been deleted.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <section aria-labelledby="reviews-heading" className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-full bg-secondary/40 flex items-center justify-center">
          <Star className="h-5 w-5 text-primary" />
        </div>
        <h2 id="reviews-heading" className="text-h3 text-foreground">
          Ratings &amp; Reviews
        </h2>
      </div>

      {status === 'loading' && (
        <div className="flex flex-col gap-4">
          <SkeletonBox className="h-20 w-full max-w-xs" />
          <SkeletonBox className="h-32 w-full" />
        </div>
      )}

      {status === 'error' && (
        <ErrorState
          title="Couldn't load reviews"
          description="Something went wrong fetching ratings for this title."
          action={
            <Button variant="secondary" onClick={() => void load()}>
              Try again
            </Button>
          }
        />
      )}

      {status === 'ready' && aggregate && (
        <div className="flex flex-col gap-6">
          {/* Aggregate */}
          <div className="flex items-center gap-5 rounded-lg border border-border bg-card px-6 py-5">
            {aggregate.count > 0 && aggregate.average != null ? (
              <>
                <div className="flex flex-col items-center leading-none">
                  <span className="text-4xl font-bold text-foreground">
                    {aggregate.average.toFixed(1)}
                  </span>
                  <span className="text-meta text-muted-foreground mt-1">
                    out of 5
                  </span>
                </div>
                <div className="flex flex-col gap-1.5">
                  <StarDisplay value={aggregate.average} />
                  <span className="text-meta text-muted-foreground">
                    {aggregate.count}{' '}
                    {aggregate.count === 1 ? 'rating' : 'ratings'}
                  </span>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-3 text-muted-foreground">
                <MessageSquare className="h-5 w-5" />
                <p className="text-body-regular">
                  No ratings yet
                  {isAuthenticated ? ' — be the first to review this.' : '.'}
                </p>
              </div>
            )}
          </div>

          {/* Viewer's own review editor */}
          {isAuthenticated ? (
            <div className="flex flex-col gap-4 rounded-lg border border-border bg-card px-6 py-5">
              <h3 className="text-body-lg font-semibold text-foreground">
                {mine ? 'Your review' : 'Rate this title'}
              </h3>

              <StarPicker
                value={rating}
                onChange={setRating}
                disabled={saving || deleting}
              />

              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="review-body"
                  className="text-meta text-muted-foreground"
                >
                  Review (optional)
                </label>
                <textarea
                  id="review-body"
                  value={body}
                  maxLength={REVIEW_BODY_MAX}
                  onChange={(e) => setBody(e.target.value)}
                  disabled={saving || deleting}
                  rows={4}
                  placeholder="Share what you thought…"
                  className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-elevation-input transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-y"
                />
                <span className="self-end text-meta text-muted-foreground">
                  {body.length}/{REVIEW_BODY_MAX}
                </span>
              </div>

              <div className="flex items-center gap-3">
                <Button onClick={handleSave} disabled={saving || deleting}>
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  {mine ? 'Update review' : 'Save review'}
                </Button>
                {mine && (
                  <Button
                    variant="ghost"
                    onClick={() => setConfirmOpen(true)}
                    disabled={saving || deleting}
                    className="gap-2 text-destructive hover:text-destructive"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-start gap-3 rounded-lg border border-border bg-card px-6 py-5">
              <p className="text-body-regular text-muted-foreground">
                Sign in to rate and review this title.
              </p>
              <Button asChild variant="secondary">
                <Link href="/signin">Sign in</Link>
              </Button>
            </div>
          )}

          {/* Community written reviews (moderated on write). */}
          {reviews.length > 0 ? (
            <div className="flex flex-col gap-4">
              <h3 className="text-body-lg font-semibold text-foreground">
                {reviews.length === 1 ? '1 review' : `${reviews.length} reviews`}
              </h3>
              <ul className="flex flex-col gap-4">
                {reviews.map((r) => (
                  <ReviewListItem key={r.id} review={r} />
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-body-regular text-muted-foreground">
              No written reviews yet.
              {isAuthenticated && !mine
                ? ' Be the first to share your thoughts.'
                : ''}
            </p>
          )}
        </div>
      )}

      <ConfirmDestructiveModal
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Delete your review?"
        description="This removes your rating and written review for this title. You can always add a new one later."
        confirmLabel="Delete review"
        onConfirm={handleDelete}
      />
    </section>
  );
}
