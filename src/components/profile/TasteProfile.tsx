import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { getGenreId } from '@/lib/tmdb-genres';
import type { TasteProfile as TasteProfileData } from '@/services/profile';

interface TasteProfileProps {
  taste: TasteProfileData;
  isSelf?: boolean;
}

// Maps a cleaned streaming-provider display name (as produced by the taste
// profile via cleanProviderName) to the slug the search page's `service`
// filter accepts. Keyed lowercase. Only the services search supports are
// listed — any other provider (Peacock, Paramount+, …) stays inert so we
// never deep-link to a filter the search page would silently drop.
const PROVIDER_SEARCH_SLUGS: Record<string, string> = {
  netflix: 'netflix',
  'prime video': 'prime',
  'amazon prime video': 'prime',
  prime: 'prime',
  'disney+': 'disney',
  'disney plus': 'disney',
  hulu: 'hulu',
  'hbo max': 'max',
  max: 'max',
  'apple tv+': 'apple',
  'apple tv plus': 'apple',
};

// Genre chips -> /search?genre=<tmdb id>. The chips carry no media type, so we
// omit `type` and let search default to movie discovery. Returns null for
// names with no known TMDB id (e.g. TV-only genres) so they render inert.
function genreHref(name: string): string | null {
  const id = getGenreId(name);
  return id ? `/search?genre=${id}` : null;
}

// Provider chips -> /search?service=<slug>, or null when the provider isn't one
// of the services the search filter understands.
function providerHref(name: string): string | null {
  const slug = PROVIDER_SEARCH_SLUGS[name.trim().toLowerCase()];
  return slug ? `/search?service=${slug}` : null;
}

// Decade chips arrive as e.g. "1990s". Search only exposes a hard single-year
// filter, so we deep-link to the decade's start year. It's an approximation of
// "the era", but lands the user on a relevant, non-empty result set.
function decadeHref(decade: string): string | null {
  const match = /^(\d{4})s$/.exec(decade.trim());
  return match ? `/search?year=${match[1]}` : null;
}

export function TasteProfile({ taste, isSelf = true }: TasteProfileProps) {
  const empty =
    taste.genres.length === 0 &&
    taste.decades.length === 0 &&
    taste.providers.length === 0;

  return (
    <Card className="p-6">
      <div className="flex items-center gap-2.5 mb-5">
        <Sparkles className="w-5 h-5 text-primary" />
        <h3 className="text-lg font-semibold">Taste</h3>
      </div>

      {empty ? (
        <p className="text-sm text-muted-foreground">
          {isSelf
            ? 'Your taste profile is still learning. Favorite some movies and shows to fill it in.'
            : 'Not enough favorites yet to summarize.'}
        </p>
      ) : (
        <div className="flex flex-col gap-5">
          {taste.genres.length > 0 && (
            <PillRow
              label="Loves to watch"
              items={taste.genres}
              hrefFor={genreHref}
              ariaLabelFor={(g) => `Search ${g} titles`}
            />
          )}
          {taste.providers.length > 0 && (
            <PillRow
              label="Streams on"
              items={taste.providers}
              hrefFor={providerHref}
              ariaLabelFor={(p) => `Search titles on ${p}`}
            />
          )}
          {taste.decades.length > 0 && (
            <PillRow
              label="Era"
              items={taste.decades}
              hrefFor={decadeHref}
              ariaLabelFor={(d) => `Search titles from the ${d}`}
            />
          )}
        </div>
      )}
    </Card>
  );
}

// Base chip styling, shared by clickable (Link) and inert (span) chips so a row
// reads as one coherent set. Clickable chips layer on hover/focus affordances.
const PILL_BASE =
  'px-3.5 py-1.5 rounded-full bg-primary/15 text-primary text-sm font-medium border border-primary/30';
const PILL_INTERACTIVE =
  'cursor-pointer transition-colors hover:bg-primary/25 hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background';

function PillRow({
  label,
  items,
  hrefFor,
  ariaLabelFor,
}: {
  label: string;
  items: string[];
  // Returns a search deep-link for a chip, or null to render it inert.
  hrefFor?: (item: string) => string | null;
  ariaLabelFor?: (item: string) => string;
}) {
  return (
    <div className="flex flex-col gap-3">
      <span className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-semibold">
        {label}
      </span>
      <div className="flex flex-wrap gap-2.5">
        {items.map((it) => {
          const href = hrefFor?.(it) ?? null;

          if (href) {
            return (
              <Link
                key={it}
                href={href}
                aria-label={ariaLabelFor?.(it) ?? it}
                className={`${PILL_BASE} ${PILL_INTERACTIVE}`}
              >
                {it}
              </Link>
            );
          }

          return (
            <span key={it} className={PILL_BASE}>
              {it}
            </span>
          );
        })}
      </div>
    </div>
  );
}
