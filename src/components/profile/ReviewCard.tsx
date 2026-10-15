import Link from 'next/link';
import Image from 'next/image';
import { Star } from 'lucide-react';
import { cn } from '@/lib/cn';
import { buildImageUrl } from '@/lib/tmdb';
import type { EnrichedReview } from '@/services/reviews';

/**
 * Compact review row for the profile "Reviews" tab: poster + title/year, the
 * star rating, and an optional body snippet. Links to the title page.
 */
export function ReviewCard({ review }: { review: EnrichedReview }) {
  const poster = buildImageUrl(review.posterPath, 'w342');
  const href = `/title/${review.titleType}/${review.titleId}`;

  return (
    <Link
      href={href}
      className="group flex gap-3 rounded-lg border border-border/40 bg-card p-3 hover:bg-muted/30 transition-colors"
    >
      <div className="relative w-16 shrink-0 aspect-2/3 rounded-md overflow-hidden bg-muted">
        {poster ? (
          <Image
            src={poster}
            alt={review.title}
            fill
            className="object-cover"
            sizes="64px"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-[10px] text-muted-foreground text-center p-1">
            No Poster
          </div>
        )}
      </div>
      <div className="min-w-0 flex flex-col gap-1">
        <h3 className="text-sm font-semibold text-foreground line-clamp-1 group-hover:text-primary transition-colors">
          {review.title || 'Untitled'}
          {review.year ? (
            <span className="text-muted-foreground font-normal"> · {review.year}</span>
          ) : null}
        </h3>
        <div
          className="flex items-center gap-0.5"
          aria-label={`${review.rating} out of 5 stars`}
        >
          {[1, 2, 3, 4, 5].map((n) => (
            <Star
              key={n}
              className={cn(
                'w-3.5 h-3.5',
                n <= review.rating
                  ? 'fill-primary text-primary'
                  : 'text-muted-foreground/30',
              )}
            />
          ))}
        </div>
        {review.body && (
          <p className="text-xs text-muted-foreground line-clamp-2">
            {review.body}
          </p>
        )}
      </div>
    </Link>
  );
}
