'use client';

import React from 'react';
import Link from 'next/link';
import { CalendarClock, Star, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/cn';
import { QuickViewLink } from '@/components/watchly/QuickViewLink';
import { isUnreleased, popularityTier, titleBasics } from './titleParts';
import type { TitlePagePayload } from '@/services/tmdb/title';
import type { ReviewAggregate } from '@/services/reviews';

// Kicker + title + meta (from B) with A's credit line, made clickable, and a
// signals row: release status, Watchly score, popularity tier.
export function TitleHeader({
  titleData,
  aggregate,
  compact,
}: {
  titleData: TitlePagePayload;
  aggregate: ReviewAggregate | null;
  /** Quick View: h2 and a smaller title. */
  compact?: boolean;
}) {
  const Heading = compact ? 'h2' : 'h1';
  const { details, contentRating, mediaType, extras } = titleData;
  const b = titleBasics(titleData);
  const unreleased = isUnreleased(mediaType, extras.status);
  const tier = popularityTier(extras.popularity);
  const score = aggregate && aggregate.count > 0 && aggregate.average ? aggregate : null;

  return (
    <div className="flex flex-col gap-3">
      <p className="type-kicker text-muted-foreground">
        {[b.kindLabel, details.year, b.runtimeLabel].filter(Boolean).join(' · ')}
      </p>
      <Heading
        className={cn(
          'font-bold leading-[1.02] tracking-tight text-foreground text-balance',
          compact ? 'text-3xl' : 'text-4xl md:text-6xl',
        )}
      >
        {details.title}
      </Heading>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground">
        {details.year && <span>{details.year}</span>}
        {contentRating && (
          <span className="border border-muted-foreground/40 px-1.5 rounded-sm text-xs leading-5 uppercase">
            {contentRating}
          </span>
        )}
        {b.runtimeLabel && <span>{b.runtimeLabel}</span>}
        {b.seriesSummary.length > 0 && <span>{b.seriesSummary.join(' · ')}</span>}
      </div>

      {b.creditPeople.length > 0 && (
        <p className="text-sm text-muted-foreground">
          {b.creditLabel}{' '}
          {b.creditPeople.map((p, i) => (
            <React.Fragment key={p.id}>
              {i > 0 && (i === b.creditPeople.length - 1 ? ' & ' : ', ')}
              <QuickViewLink
                mediaType="person"
                titleId={p.id}
                className="font-medium text-foreground underline decoration-foreground/25 underline-offset-4 hover:decoration-foreground"
              >
                {p.name}
              </QuickViewLink>
            </React.Fragment>
          ))}
        </p>
      )}

      {(unreleased || score || tier) && (
        <div className="flex flex-wrap items-center gap-2">
          {unreleased && (
            <span className="inline-flex items-center gap-1.5 rounded-sm bg-primary-soft px-2 py-1 text-xs font-semibold text-foreground">
              <CalendarClock className="w-3.5 h-3.5" /> Not yet released
            </span>
          )}
          {score && (
            <a
              href="#reviews"
              className="inline-flex items-center gap-1.5 rounded-sm border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <Star className="w-3.5 h-3.5 text-primary fill-current" />
              <span className="font-semibold text-foreground">{score.average!.toFixed(1)}</span>
              /5 Watchly · {score.count} {score.count === 1 ? 'rating' : 'ratings'}
            </a>
          )}
          {tier && (
            <span
              className="inline-flex items-center gap-1.5 rounded-sm border border-border px-2 py-1 text-xs text-muted-foreground"
              title={`TMDB popularity ${extras.popularity?.toFixed(1)}`}
            >
              <TrendingUp className="w-3.5 h-3.5" /> {tier}
            </span>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2 pt-0.5">
        {details.genres.map((g) => (
          <Link
            key={g.id}
            href={`/search?genre=${g.id}&type=${mediaType}`}
            className="px-3 py-1 rounded-sm bg-secondary text-xs font-semibold text-foreground hover:bg-secondary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {g.name}
          </Link>
        ))}
      </div>
    </div>
  );
}
