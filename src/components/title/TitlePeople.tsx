'use client';

import React from 'react';
import Image from 'next/image';
import { buildImageUrl } from '@/lib/tmdb';
import { QuickViewLink } from '@/components/watchly/QuickViewLink';
import { ArrowStrip } from '@/components/ui/ArrowStrip';
import type { CastMember, CrewMember, TitlePagePayload } from '@/services/tmdb/title';

/** D's end-credits cast: grey-to-colour portraits, mono role line. */
export function StarringRow({ cast }: { cast: CastMember[] }) {
  if (cast.length === 0) return null;
  return (
    <section aria-labelledby="starring-heading" className="flex flex-col gap-4">
      <h2 id="starring-heading" className="type-kicker text-muted-foreground">Starring</h2>
      <ArrowStrip label="cast">
      <ol className="flex gap-5 overflow-x-auto pb-3 no-scrollbar">
        {cast.map((m) => {
          const src = buildImageUrl(m.profilePath, 'w185');
          return (
            <li key={m.id} className="w-[132px] shrink-0">
              <QuickViewLink
                mediaType="person"
                titleId={m.id}
                className="group flex flex-col gap-2 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="relative aspect-2/3 w-full overflow-hidden border border-foreground/15 bg-card">
                  {src ? (
                    <Image
                      src={src}
                      alt={m.name}
                      fill
                      sizes="132px"
                      className="object-cover grayscale group-hover:grayscale-0 transition-[filter] duration-300"
                    />
                  ) : (
                    <span className="absolute inset-0 flex items-end p-2 text-sm font-semibold text-muted-foreground">{m.name}</span>
                  )}
                </div>
                <span className="text-sm font-semibold text-foreground leading-tight truncate">{m.name}</span>
                {m.character && (
                  <span className="-mt-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground truncate">
                    as {m.character}
                  </span>
                )}
              </QuickViewLink>
            </li>
          );
        })}
      </ol>
      </ArrowStrip>
    </section>
  );
}

const MOVIE_JOBS = [
  'Director', 'Screenplay', 'Writer', 'Novel', 'Story', 'Producer',
  'Director of Photography', 'Original Music Composer', 'Editor', 'Casting',
];
const TV_JOBS = ['Executive Producer', 'Original Music Composer', 'Director of Photography', 'Casting'];
const PER_JOB = 3;

function crewGroups(t: TitlePagePayload): { job: string; people: { id: number; name: string }[] }[] {
  const crew: CrewMember[] = t.credits?.crew ?? [];
  const groups: { job: string; people: { id: number; name: string }[] }[] = [];
  if (t.mediaType === 'tv' && t.infoPanelData.keyCrew.creators.length) {
    groups.push({ job: 'Created by', people: t.infoPanelData.keyCrew.creators.slice(0, PER_JOB) });
  }
  for (const job of t.mediaType === 'tv' ? TV_JOBS : MOVIE_JOBS) {
    const seen = new Set<number>();
    const people = crew
      .filter((c) => c.job === job && !seen.has(c.id) && seen.add(c.id))
      .slice(0, PER_JOB)
      .map((c) => ({ id: c.id, name: c.name }));
    if (people.length) groups.push({ job, people });
  }
  return groups;
}

/** Full-width crew grid; shares the cast row's container so right edges line up. */
export function CrewGrid({ titleData }: { titleData: TitlePagePayload }) {
  const groups = crewGroups(titleData);
  if (groups.length === 0) return null;
  return (
    <section aria-labelledby="crew-heading" className="flex flex-col gap-3 w-full">
      <h2 id="crew-heading" className="type-kicker text-muted-foreground">Crew</h2>
      <dl className="grid w-full grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-8 border-t border-border">
        {groups.map((g) => (
          // Job above names: side by side, a long job ("Director of
          // Photography") overflowed into the next column at 3 columns.
          <div key={g.job} className="flex min-w-0 flex-col gap-0.5 border-b border-border py-3">
            <dt className="text-xs text-muted-foreground">{g.job}</dt>
            <dd className="text-sm font-semibold text-foreground break-words">
              {g.people.map((p, i) => (
                <React.Fragment key={p.id}>
                  {i > 0 && ', '}
                  <QuickViewLink mediaType="person" titleId={p.id} className="hover:text-primary">
                    {p.name}
                  </QuickViewLink>
                </React.Fragment>
              ))}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
