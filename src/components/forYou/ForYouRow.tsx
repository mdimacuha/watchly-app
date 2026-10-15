import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { ForYouCard } from './ForYouCard';
import type { ForYouRow as ForYouRowData } from '@/services/forYou';

interface ForYouRowProps {
  row: ForYouRowData;
  /** Optional 'View All' destination — renders a link in the row header. */
  viewAllHref?: string;
}

/**
 * Horizontally scrolling row of recommendations. Scrollbar hidden by
 * default, fades in on hover. Optional 'View All →' link sits opposite
 * the title for rows that have a dedicated full-list page.
 */
export function ForYouRow({ row, viewAllHref }: ForYouRowProps) {
  return (
    <section className="flex flex-col gap-4">
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

      <div className="overflow-x-auto scrollbar-hover -mx-4 px-4 snap-x snap-mandatory">
        <div className="flex gap-4 min-w-max pb-2">
          {row.items.map((item) => (
            <ForYouCard key={`${item.mediaType}:${item.tmdbId}`} item={item} />
          ))}
        </div>
      </div>
    </section>
  );
}
