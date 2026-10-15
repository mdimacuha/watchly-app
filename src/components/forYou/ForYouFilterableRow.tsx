'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import { ForYouCard } from './ForYouCard';
import type { ForYouCandidate, ForYouRow } from '@/services/forYou';

export interface FilterChip {
  id: string;
  label: string;
  /** Predicate run against each item; only matching items are rendered. */
  predicate: (item: ForYouCandidate) => boolean;
}

interface ForYouFilterableRowProps {
  row: ForYouRow;
  chips: FilterChip[];
  /** Optional 'View All' link target. */
  viewAllHref?: string;
}

/**
 * Client wrapper around a For You row that adds chip filters above the
 * scroller. Filters apply locally — no refetch. Designed for rows where
 * the same backing list can be sliced by metadata (mediaType, runtime,
 * rating).
 */
export function ForYouFilterableRow({
  row,
  chips,
  viewAllHref,
}: ForYouFilterableRowProps) {
  const [activeId, setActiveId] = useState<string>(chips[0]?.id ?? 'all');

  const active = chips.find((c) => c.id === activeId) ?? chips[0];
  const filteredItems = active ? row.items.filter(active.predicate) : row.items;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-baseline gap-3">
          <h2 className="text-lg font-semibold tracking-tight">{row.title}</h2>
          {row.subtitle && (
            <span className="text-xs text-muted-foreground">{row.subtitle}</span>
          )}
        </div>
        {viewAllHref && (
          <Link
            href={viewAllHref}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-0.5"
          >
            View All
            <ChevronRight className="w-3 h-3" />
          </Link>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {chips.map((chip) => (
          <button
            key={chip.id}
            type="button"
            onClick={() => setActiveId(chip.id)}
            className={cn(
              'inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border transition-colors cursor-pointer',
              activeId === chip.id
                ? 'bg-foreground text-background border-foreground'
                : 'bg-card text-muted-foreground border-border hover:text-foreground hover:border-foreground/50',
            )}
          >
            {chip.label}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto scrollbar-hover -mx-4 px-4 snap-x snap-mandatory">
        <div className="flex gap-4 min-w-max pb-2">
          {filteredItems.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 px-2">
              Nothing matches this filter.
            </p>
          ) : (
            filteredItems.map((item) => (
              <ForYouCard
                key={`${item.mediaType}:${item.tmdbId}`}
                item={item}
              />
            ))
          )}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Preset chip sets
// ---------------------------------------------------------------------------

export const FAVORITES_CHIPS: FilterChip[] = [
  { id: 'all', label: 'All', predicate: () => true },
  {
    id: 'movies',
    label: 'Movies',
    predicate: (i) => i.mediaType === 'movie',
  },
  {
    id: 'tv',
    label: 'TV Shows',
    predicate: (i) => i.mediaType === 'tv',
  },
  {
    id: 'under_2h',
    label: 'Under 2h',
    predicate: (i) =>
      typeof i.runtimeMinutes === 'number' && i.runtimeMinutes <= 120,
  },
];

export const QUICK_PICKS_CHIPS: FilterChip[] = [
  { id: 'all', label: 'All', predicate: () => true },
  {
    id: 'under_90',
    label: 'Under 90 min',
    predicate: (i) =>
      typeof i.runtimeMinutes === 'number' && i.runtimeMinutes <= 90,
  },
  {
    id: 'under_2h',
    label: 'Under 2h',
    predicate: (i) =>
      typeof i.runtimeMinutes === 'number' && i.runtimeMinutes <= 120,
  },
  {
    id: 'highly_rated',
    label: 'Highly Rated',
    predicate: (i) => i.voteAverage >= 7.5,
  },
];
