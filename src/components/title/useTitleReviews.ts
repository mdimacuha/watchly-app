'use client';

import { useCallback, useEffect, useState } from 'react';
import { FEATURES } from '@/constants/features';
import { useToast } from '@/hooks/useToast';
import {
  deleteReviewAction,
  finishReviewedItemsAction,
  getReviewsForTitleAction,
  saveReviewAction,
} from '@/actions/reviews';
import type { ReviewAggregate, TitleReview, UserReview } from '@/services/reviews';

export type ReviewsState = ReturnType<typeof useTitleReviews>;

// One fetch shared by the header's Watchly score and the reviews panel.
// Gated by FEATURES.reviews.
export function useTitleReviews(mediaType: 'movie' | 'tv', id: string) {
  const toast = useToast();
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'off'>(
    FEATURES.reviews ? 'loading' : 'off',
  );
  const [aggregate, setAggregate] = useState<ReviewAggregate | null>(null);
  const [mine, setMine] = useState<UserReview | null>(null);
  const [reviews, setReviews] = useState<TitleReview[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!FEATURES.reviews) return;
    setStatus('loading');
    try {
      const r = await getReviewsForTitleAction(id, mediaType);
      setAggregate(r.aggregate);
      setMine(r.mine);
      setReviews(r.reviews);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, [id, mediaType]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const save = async (rating: number, body: string, isSpoiler = false): Promise<boolean> => {
    setBusy(true);
    try {
      const result = await saveReviewAction(id, mediaType, { rating, body, isSpoiler });
      if (!result.ok) {
        toast.error('Could not save review', result.error);
        return false;
      }
      setAggregate(result.aggregate);
      setMine(result.mine);
      const { unfinished } = result;
      if (unfinished.length > 0) {
        const where =
          unfinished.length === 1 ? unfinished[0].watchlistName : `${unfinished.length} lists`;
        const toastId = toast.custom({
          type: 'success',
          variant: 'action',
          title: 'Review saved',
          description: `Still unfinished in ${where}.`,
          actionLabel: 'Mark as finished',
          duration: 8000,
          onAction: () => {
            toast.dismiss(toastId);
            finishReviewedItemsAction(unfinished).then(
              () => toast.success('Marked as finished', `Updated in ${where}.`),
              () => toast.error('Could not update your lists', 'Please try again.'),
            );
          },
        });
      } else {
        toast.success('Review saved', 'Your rating has been recorded.');
      }
      return true;
    } catch {
      toast.error('Could not save review', 'Please try again.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      const { aggregate: agg } = await deleteReviewAction(id, mediaType);
      setAggregate(agg);
      setMine(null);
      toast.success('Review removed', 'Your review has been deleted.');
    } finally {
      setBusy(false);
    }
  };

  return { status, aggregate, mine, reviews, busy, load, save, remove };
}
