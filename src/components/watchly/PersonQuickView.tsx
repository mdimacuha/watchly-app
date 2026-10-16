'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { buildImageUrl } from '@/lib/tmdb';
import { ErrorState } from '@/components/watchly/ErrorState';
import { SkeletonBox } from '@/components/watchly/skeletons';
import { QuickViewLink } from '@/components/watchly/QuickViewLink';
import type { PersonQuickViewPayload } from '@/services/tmdb/person';
import type { ApiResponse } from '@/types/api';

interface PersonQuickViewContentProps {
  id: string;
  onClose: () => void;
  closeButton: ReactNode;
}

/**
 * Person (cast) variant of the Quick View popup: photo, bio, and their top 5
 * acting roles. Clicking a role swaps the popup to that title's Quick View.
 * Layout mirrors the title variant so the two read as one component.
 */
export function PersonQuickViewContent({ id, onClose, closeButton }: PersonQuickViewContentProps) {
  const [data, setData] = useState<PersonQuickViewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    // Keyed by person id in the modal, so a fresh open starts loading=true.
    const controller = new AbortController();
    fetch(`/api/v1/people/${id}`, { signal: controller.signal })
      .then(async (res) => {
        const json = (await res.json()) as ApiResponse<PersonQuickViewPayload>;
        if (!res.ok || !json.success || !json.data) throw new Error('Failed to load person');
        setData(json.data);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [id, nonce]);

  if (loading) {
    return (
      <div className="relative">
        {closeButton}
        <div className="p-5 sm:p-6 pt-14 sm:pt-14 flex flex-col gap-5">
          <div className="flex gap-4">
            <SkeletonBox className="w-24 sm:w-28 shrink-0 aspect-[2/3] rounded-lg" />
            <div className="flex-1 flex flex-col gap-3 pt-1">
              <SkeletonBox className="h-6 w-2/3" />
              <SkeletonBox className="h-4 w-1/3" />
              <SkeletonBox className="h-10 w-32" />
            </div>
          </div>
          <SkeletonBox className="h-16 w-full" />
          <SkeletonBox className="h-48 w-full" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="relative">
        {closeButton}
        <ErrorState
          title="Couldn't load this person"
          description="Something went wrong. Please try again."
          action={
            <Button
              variant="secondary"
              onClick={() => {
                setError(false);
                setLoading(true);
                setNonce((n) => n + 1);
              }}
            >
              Try again
            </Button>
          }
        />
      </div>
    );
  }

  const { details, topActing } = data;
  const photoUrl = buildImageUrl(details.profilePath, 'w342');
  const meta = [
    details.knownForDepartment,
    lifespan(details.birthday, details.deathday),
    details.placeOfBirth,
  ].filter(Boolean);

  return (
    <div className="relative">
      {closeButton}
      <div className="p-5 sm:p-6 pt-14 sm:pt-14 flex flex-col gap-5">
        <div className="flex gap-4">
          <div className="relative w-24 sm:w-28 shrink-0 aspect-[2/3] rounded-lg overflow-hidden border border-border/40 shadow-xl bg-muted">
            {photoUrl && (
              <Image src={photoUrl} alt={details.name} fill className="object-cover" sizes="112px" />
            )}
          </div>
  
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            <h2 className="text-h3 text-foreground leading-tight">{details.name}</h2>
            {meta.length > 0 && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground font-medium">
                {meta.map((m) => (
                  <span key={m}>{m}</span>
                ))}
              </div>
            )}
  
            <div className="mt-2">
              <Button asChild variant="secondary" className="gap-2">
                <Link href={`/artist/${details.id}`} onClick={onClose}>
                  <ArrowUpRight className="w-4 h-4" />
                  <span>Go to Page</span>
                </Link>
              </Button>
            </div>
          </div>
        </div>
  
        {details.biography && (
          <p className="text-body-regular text-muted-foreground/90 leading-relaxed line-clamp-4">
            {details.biography}
          </p>
        )}
  
        {topActing.length > 0 && (
          <div className="rounded-lg bg-muted/10 border border-border/40 px-4 py-3">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2">
              Top acting roles
            </h3>
            <ol className="flex flex-col">
              {topActing.map((credit) => {
                const poster = buildImageUrl(credit.posterPath, 'w92');
                return (
                  <li key={`${credit.mediaType}:${credit.id}`}>
                    <QuickViewLink
                      mediaType={credit.mediaType}
                      titleId={credit.id}
                      className="group flex items-center gap-3 rounded-md py-2 -mx-2 px-2 hover:bg-foreground/5 transition-colors"
                    >
                      <div className="relative h-14 w-10 shrink-0 overflow-hidden rounded bg-muted">
                        {poster && (
                          <Image src={poster} alt="" fill className="object-cover" sizes="40px" />
                        )}
                      </div>
                      <div className="min-w-0 flex flex-col">
                        <span className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                          {credit.title}
                          {credit.year && (
                            <span className="font-normal text-muted-foreground"> · {credit.year}</span>
                          )}
                        </span>
                        {credit.character && (
                          <span className="text-xs text-muted-foreground truncate">
                            as {credit.character}
                          </span>
                        )}
                      </div>
                    </QuickViewLink>
                  </li>
                );
              })}
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}

/** "b. 1975" / "1934–2016" — compact life dates for the meta row. */
function lifespan(birthday: string | null, deathday: string | null): string | null {
  const born = birthday?.slice(0, 4);
  const died = deathday?.slice(0, 4);
  if (born && died) return `${born}–${died}`;
  if (born) return `b. ${born}`;
  return null;
}
