'use client';

import type { ReactNode } from 'react';
import Image from 'next/image';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { User } from 'lucide-react';
import { cn } from '@/lib/cn';
import { buildImageUrl } from '@/lib/tmdb';
import { QuickViewLink } from '@/components/watchly/QuickViewLink';
import { ProviderBadge } from '@/components/ui/ProviderBadge';
import { NotInRegionPill } from '@/components/ui/NotInRegionPill';
import { ArrowStrip } from '@/components/ui/ArrowStrip';
import type { SearchPerson, SearchResponse, SearchResponseItem } from '@/types/tmdb';
import { SearchResultsGrid } from './SearchResultsGrid';
import { TmdbGridItem } from './TmdbGridItem';
import { Pagination } from './Pagination';
import { SearchEndCap } from './SearchEndCap';
import { trackSearch } from '@/client/searchEvents';
import { SeenItButton } from '@/components/watched/SeenItButton';

interface SearchResultsProps {
  data: SearchResponse | null;
  isFetching: boolean;
  error: string | null;
  regionName?: string;
}

type Related = NonNullable<SearchResponse['related']>;

/** Reports which section a result was opened from (search_events). */
type OnOpen = (section: string, mediaType: string, id: number, position: number) => void;

/**
 * Search results for a typed query, as sections:
 *   top result (hero) → People → Related by theme → Titles → end-cap picks.
 * Browsing (no query), loading, errors and empty pages use the poster grid.
 */
export function SearchResults(props: SearchResultsProps) {
  const searchParams = useSearchParams();
  const query = (searchParams.get('q') || '').trim();
  const { data, error, isFetching } = props;

  const hasSections =
    !!query &&
    !!data &&
    !error &&
    (data.results.length > 0 || (data.people?.length ?? 0) > 0 || !!data.related);

  if (!hasSections) {
    // Nothing matched at all: keep the no-results message, still offer picks.
    const deadEnd = !!query && !!data && !error && !isFetching && data.results.length === 0;
    return (
      <>
        <SearchResultsGrid {...props} />
        {deadEnd && <SearchEndCap query={query} data={data!} />}
      </>
    );
  }

  return <Sections data={data!} query={query} isFetching={isFetching} />;
}

function Sections({ data, query, isFetching }: { data: SearchResponse; query: string; isFetching: boolean }) {
  const isFirstPage = data.page === 1;
  // A person-name search: the person is the answer, not a title about them.
  const spotlight = isFirstPage ? data.personSpotlight ?? null : null;
  const top = isFirstPage && !spotlight ? data.results[0] : undefined;
  const otherPeople = (data.people ?? []).filter((p) => p.id !== spotlight?.person.id);
  const rest = top ? data.results.slice(1) : data.results;
  const noTitles = data.results.length === 0;

  // End-cap: once title matches run out (last page, or none at all) — but
  // not after an exact title hit: that search is done, picks would be noise.
  const atEnd = noTitles || data.page >= data.total_pages;
  const exactHit = !!top && top.title.toLowerCase() === query.toLowerCase();
  const opened: OnOpen = (section, mediaType, id, position) =>
    trackSearch('result_opened', query, { section, mediaType, id, position, page: data.page });

  return (
    <div className="flex flex-col gap-10">
      {spotlight && (
        <>
          <PersonHero
            person={spotlight.person}
            onOpen={() => opened('spotlight_person', 'person', spotlight.person.id, 1)}
          />
          <section>
            <SectionHeader
              title={`Movies & shows with ${spotlight.person.name}`}
              meta="Most notable roles"
            />
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {spotlight.credits.map((item, i) => (
                <TmdbGridItem
                  key={`${item.mediaType}-${item.id}`}
                  item={item}
                  onOpen={() => opened('spotlight_credits', item.mediaType, item.id, i + 1)}
                />
              ))}
            </div>
          </section>
        </>
      )}
      {top && <TopResult item={top} query={query} onOpen={() => opened('top', top.mediaType, top.id, 1)} />}
      {otherPeople.length > 0 && <PeopleRow people={otherPeople} onOpen={opened} />}
      {isFirstPage &&
        data.related &&
        (noTitles ? (
          <RelatedGrid related={data.related} onOpen={opened} />
        ) : (
          <RelatedRow related={data.related} onOpen={opened} />
        ))}
      {rest.length > 0 && (
        <section>
          <SectionHeader
            title="Titles"
            meta={
              <span aria-live="polite">
                {/* Exact on a single page (counting only this grid — the top
                    result sits in the hero); TMDB's estimate across pages. */}
                {data.total_pages <= 1
                  ? `${rest.length} more matching “${query}”`
                  : `About ${data.total_results.toLocaleString()} matching “${query}”`}
              </span>
            }
          />
          {data.filteredWithinPage && (
            <p className="-mt-1 mb-3 text-xs text-muted-foreground">
              Filters are applied to each page of matches, so some pages show fewer titles.
            </p>
          )}
          <div
            className={cn(
              'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 transition-opacity',
              isFetching && 'opacity-50',
            )}
            aria-busy={isFetching}
          >
            {rest.map((item, i) => (
              <TmdbGridItem
                key={`${item.mediaType}-${item.id}`}
                item={item}
                onOpen={() => opened('titles', item.mediaType, item.id, i + (top ? 2 : 1))}
              />
            ))}
          </div>
          <div className="flex justify-center pt-8 pb-4">
            <Pagination currentPage={data.page} totalPages={data.total_pages} />
          </div>
        </section>
      )}
      {/* A person search is answered by their filmography — no end-cap. */}
      {atEnd && !exactHit && !spotlight && <SearchEndCap query={query} data={data} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

function SectionHeader({ title, meta }: { title: string; meta?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      {meta && <span className="text-sm text-muted-foreground">{meta}</span>}
    </div>
  );
}

/** Best match as a hero: backdrop, where to watch, Quick View. */
function TopResult({ item, query, onOpen }: { item: SearchResponseItem; query: string; onOpen: () => void }) {
  const backdrop = buildImageUrl(item.backdropPath, 'w780');
  const poster = buildImageUrl(item.posterPath, 'w342');
  const exact = item.title.toLowerCase() === query.toLowerCase();
  return (
    <section aria-label="Top result" className="relative overflow-hidden rounded-xl border border-border bg-card">
      {backdrop && <Image src={backdrop} alt="" fill sizes="1200px" className="object-cover opacity-30" />}
      <div className="absolute inset-0 bg-linear-to-r from-card via-card/85 to-transparent" />
      <div className="relative flex gap-5 p-5">
        <div className="relative hidden sm:block h-48 w-32 shrink-0 overflow-hidden rounded-md bg-muted">
          {poster && <Image src={poster} alt="" fill sizes="128px" className="object-cover" />}
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-widest text-primary">
            {exact ? 'Top result · exact title' : 'Top result'}
          </span>
          <h2 className="text-3xl font-bold leading-tight">{item.title}</h2>
          <p className="text-sm text-muted-foreground">
            {[item.mediaType === 'movie' ? 'Movie' : 'TV series', item.year].filter(Boolean).join(' · ')}
          </p>
          {item.overview && (
            <p className="max-w-2xl text-sm text-muted-foreground/90 line-clamp-2">{item.overview}</p>
          )}
          {item.providerBadges.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {item.providerBadges.slice(0, 4).map((p) => (
                <ProviderBadge key={p.provider_name} label={p.provider_name} logoPath={p.logo_path} size="sm" />
              ))}
            </div>
          )}
          {item.providerBadges.length === 0 && item.availabilityChecked && (
            <NotInRegionPill className="w-fit" />
          )}
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <QuickViewLink
              mediaType={item.mediaType}
              titleId={item.id}
              onClick={onOpen}
              className="inline-flex h-10 w-fit items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Quick view
            </QuickViewLink>
            <SeenItButton
              key={`seen-${item.mediaType}-${item.id}`}
              mediaType={item.mediaType}
              mediaId={String(item.id)}
              title={item.title}
              posterPath={item.posterPath}
              year={item.year ?? null}
              surface="search"
              className="bg-card/60"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

/** Person-name search: the person as the top result. */
function PersonHero({ person, onOpen }: { person: SearchPerson; onOpen: () => void }) {
  const photo = buildImageUrl(person.profilePath, 'w342');
  return (
    <section aria-label="Top result" className="relative overflow-hidden rounded-xl border border-border bg-card">
      <div className="relative flex items-center gap-5 p-5">
        <div className="relative h-36 w-28 shrink-0 overflow-hidden rounded-md bg-muted">
          {photo ? (
            <Image src={photo} alt="" fill sizes="112px" className="object-cover" />
          ) : (
            <User className="m-auto mt-12 h-8 w-8 text-muted-foreground" />
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-widest text-primary">
            Top result · person
          </span>
          <h2 className="text-3xl font-bold leading-tight">{person.name}</h2>
          <p className="text-sm text-muted-foreground">
            {person.knownForDepartment}
            {person.knownFor.length > 0 && ` · Known for ${person.knownFor.map((k) => k.title).join(', ')}`}
          </p>
          <QuickViewLink
            mediaType="person"
            titleId={person.id}
            onClick={onOpen}
            className="mt-1 inline-flex h-10 w-fit items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Quick view
          </QuickViewLink>
        </div>
      </div>
    </section>
  );
}

function PeopleRow({ people, onOpen }: { people: SearchPerson[]; onOpen: OnOpen }) {
  return (
    <section>
      <SectionHeader title="People" meta={`${people.length} matching`} />
      <ArrowStrip label="people">
      <div className="no-scrollbar -mx-2 flex gap-2 overflow-x-auto px-2">
        {people.map((person, i) => {
          const photo = buildImageUrl(person.profilePath, 'w185');
          return (
            <QuickViewLink
              key={person.id}
              mediaType="person"
              titleId={person.id}
              onClick={() => onOpen('people', 'person', person.id, i + 1)}
              className="group flex w-64 shrink-0 items-center gap-3 rounded-lg p-2 hover:bg-foreground/5 transition-colors"
            >
              <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full bg-muted">
                {photo ? (
                  <Image src={photo} alt="" fill sizes="56px" className="object-cover" />
                ) : (
                  <User className="m-auto mt-4 h-6 w-6 text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold group-hover:text-primary transition-colors">
                  {person.name}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {person.knownForDepartment}
                  {person.knownFor.length > 0 && ` · ${person.knownFor.map((k) => k.title).join(', ')}`}
                </p>
              </div>
            </QuickViewLink>
          );
        })}
      </div>
      </ArrowStrip>
    </section>
  );
}

/** Theme results alongside title matches: a horizontal row. */
function RelatedRow({ related, onOpen }: { related: Related; onOpen: OnOpen }) {
  return (
    <section>
      <SectionHeader
        title={`Related to “${related.keyword.name}”`}
        meta={`Tagged “${related.keyword.name}” · about ${related.totalResults.toLocaleString()} titles`}
      />
      <ArrowStrip label="related titles">
      <div className="no-scrollbar -mx-1 flex gap-4 overflow-x-auto px-1 pb-1">
        {related.items.map((item, i) => (
          <TmdbGridItem
            key={`${item.mediaType}-${item.id}`}
            item={item}
            className="w-36 shrink-0"
            onOpen={() => onOpen('related', item.mediaType, item.id, i + 1)}
          />
        ))}
      </div>
      </ArrowStrip>
      <div className="mt-2">
        <AlsoKeywords related={related} />
      </div>
    </section>
  );
}

/** Theme results as the whole answer: a grid, keyword chips first. */
function RelatedGrid({ related, onOpen }: { related: Related; onOpen: OnOpen }) {
  return (
    <section>
      <SectionHeader
        title={`No exact matches — titles tagged “${related.keyword.name}”`}
        meta={`about ${related.totalResults.toLocaleString()} on TMDB`}
      />
      <div className="-mt-1 mb-4">
        <AlsoKeywords related={related} />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {related.items.map((item, i) => (
          <TmdbGridItem
            key={`${item.mediaType}-${item.id}`}
            item={item}
            onOpen={() => onOpen('related', item.mediaType, item.id, i + 1)}
          />
        ))}
      </div>
    </section>
  );
}

/**
 * Close keyword matches as chips. Clicking one replaces the search query with
 * that keyword — it then matches exactly, so its theme row shows that
 * keyword's tagged titles. Filters are kept; paging resets; pushes history
 * so Back returns to the previous search.
 */
function AlsoKeywords({ related }: { related: Related }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  if (related.alternatives.length === 0) return null;

  const searchFor = (name: string) => {
    trackSearch('keyword_chip_clicked', searchParams.get('q') ?? undefined, {
      from: related.keyword.name,
      to: name,
    });
    const params = new URLSearchParams(searchParams.toString());
    params.set('q', name);
    params.delete('page');
    router.push(`${pathname}?${params.toString()}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
      Also close:
      {related.alternatives.map((k) => (
        <button
          key={k.id}
          type="button"
          onClick={() => searchFor(k.name)}
          title={`Search “${k.name}”`}
          className="rounded-full border border-border px-2.5 py-1 text-foreground/80 transition-colors cursor-pointer hover:border-primary/50 hover:bg-primary/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {k.name}
        </button>
      ))}
    </div>
  );
}
