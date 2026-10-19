import React from 'react';
import Image from 'next/image';
import { buildImageUrl } from '@/lib/tmdb';
import { QuickViewLink } from '@/components/watchly/QuickViewLink';
import { ArrowStrip } from '@/components/ui/ArrowStrip';
import type { RelatedTitle } from '@/services/tmdb/title';

// "If you liked …" poster rail: merged recommendations + similar (replaces the fake "Watch / News"
// feed). Opens Quick View like every other title card.
export function RelatedRail({ title, items }: { title: string; items: RelatedTitle[] }) {
  if (items.length === 0) return null;
  const id = 'related-heading';
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <h2 id={id} className="text-lg font-bold tracking-tight text-foreground">{title}</h2>
      <ArrowStrip label="related titles">
      <ul className="flex gap-4 overflow-x-auto pb-3 no-scrollbar">
        {items.map((t) => (
          <li key={`${t.mediaType}-${t.id}`} className="w-[140px] shrink-0">
            <QuickViewLink
              mediaType={t.mediaType}
              titleId={t.id}
              className="group flex flex-col gap-2 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="relative aspect-2/3 w-full overflow-hidden rounded-sm border border-border bg-card">
                <Image
                  src={buildImageUrl(t.posterPath, 'w342')!}
                  alt={t.title}
                  fill
                  sizes="140px"
                  className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                />
              </div>
              <span className="text-sm font-semibold text-foreground leading-tight line-clamp-2">{t.title}</span>
              {t.year && <span className="-mt-1.5 text-xs text-muted-foreground">{t.year}</span>}
            </QuickViewLink>
          </li>
        ))}
      </ul>
      </ArrowStrip>
    </section>
  );
}
