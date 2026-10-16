'use client';

/**
 * Typeahead suggestions for the search field: up to 3 titles + 2 people +
 * "See all results". Picking one opens Quick View directly. Fed by the
 * page's own debounced results — no extra requests.
 */

import Image from 'next/image';
import { Search, User } from 'lucide-react';
import { cn } from '@/lib/cn';
import { buildImageUrl } from '@/lib/tmdb';
import type { SearchResponse } from '@/types/tmdb';

export interface Suggestion {
  key: string;
  kind: 'title' | 'person';
  mediaType: 'movie' | 'tv' | 'person';
  id: number;
  label: string;
  sub: string;
  imagePath: string | null;
}

const TITLE_LIMIT = 3;
const PEOPLE_LIMIT = 2;

/** Pure: suggestions from a results payload (empty when stale or none). */
export function buildSuggestions(data: SearchResponse | null | undefined): Suggestion[] {
  if (!data) return [];
  const titles: Suggestion[] = data.results.slice(0, TITLE_LIMIT).map((r) => ({
    key: `${r.mediaType}:${r.id}`,
    kind: 'title',
    mediaType: r.mediaType,
    id: r.id,
    label: r.title,
    sub: [r.mediaType === 'movie' ? 'Movie' : 'TV', r.year].filter(Boolean).join(' · '),
    imagePath: r.posterPath,
  }));
  const people: Suggestion[] = (data.people ?? []).slice(0, PEOPLE_LIMIT).map((p) => ({
    key: `person:${p.id}`,
    kind: 'person',
    mediaType: 'person',
    id: p.id,
    label: p.name,
    sub: p.knownFor.map((k) => k.title).slice(0, 2).join(', ') || p.knownForDepartment,
    imagePath: p.profilePath,
  }));
  return [...titles, ...people];
}

export const SUGGESTIONS_ID = 'search-suggestions';
export const optionId = (i: number) => `search-suggestion-${i}`;

interface SuggestionListProps {
  items: Suggestion[];
  query: string;
  /** Index into items, or items.length for "See all"; -1 for none. */
  activeIndex: number;
  onPick: (s: Suggestion) => void;
  onSeeAll: () => void;
}

/** Listbox under the input (combobox pattern). The input owns focus/keys. */
export function SuggestionList({ items, query, activeIndex, onPick, onSeeAll }: SuggestionListProps) {
  return (
    <ul
      id={SUGGESTIONS_ID}
      role="listbox"
      aria-label="Search suggestions"
      className="absolute left-0 right-0 top-full z-40 mt-2 overflow-hidden rounded-lg border border-border bg-card shadow-elevation-card"
    >
      {items.map((s, i) => (
        <li
          key={s.key}
          id={optionId(i)}
          role="option"
          aria-selected={activeIndex === i}
          // mousedown (not click) + preventDefault keeps input focus so the
          // list doesn't close before the pick lands.
          onMouseDown={(e) => {
            e.preventDefault();
            onPick(s);
          }}
          className={cn(
            'flex cursor-pointer items-center gap-3 px-3 py-2',
            activeIndex === i ? 'bg-foreground/10' : 'hover:bg-foreground/5',
          )}
        >
          <Thumb s={s} />
          <div className="min-w-0 flex flex-col">
            <span className="truncate text-sm font-medium text-foreground">{s.label}</span>
            <span className="truncate text-xs text-muted-foreground">
              {s.kind === 'person' ? `Person · ${s.sub}` : s.sub}
            </span>
          </div>
        </li>
      ))}
      <li
        id={optionId(items.length)}
        role="option"
        aria-selected={activeIndex === items.length}
        onMouseDown={(e) => {
          e.preventDefault();
          onSeeAll();
        }}
        className={cn(
          'flex cursor-pointer items-center gap-3 border-t border-border px-3 py-2.5 text-sm text-muted-foreground',
          activeIndex === items.length ? 'bg-foreground/10 text-foreground' : 'hover:bg-foreground/5',
        )}
      >
        <Search className="h-4 w-4" />
        See all results for “{query.trim()}”
      </li>
    </ul>
  );
}

function Thumb({ s }: { s: Suggestion }) {
  const url = buildImageUrl(s.imagePath, 'w92');
  return (
    <div
      className={cn(
        'relative h-12 w-8 shrink-0 overflow-hidden bg-muted',
        s.kind === 'person' ? 'h-9 w-9 rounded-full' : 'rounded',
      )}
    >
      {url ? (
        <Image src={url} alt="" fill sizes="36px" className="object-cover" />
      ) : (
        s.kind === 'person' && <User className="m-auto mt-2 h-5 w-5 text-muted-foreground" />
      )}
    </div>
  );
}
