'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowRight, Search } from 'lucide-react';
import { useAuthStore } from '@/client/stores/auth';
import { Kicker, Logo } from '@/components/onboarding/FirstNightParts';
import { Letterboard } from '@/components/watchly/Letterboard';

/**
 * "Words in the broken link" as a search to offer: /the-bear → "the bear".
 * Ids, uuids and app words ("title", "movie") give nothing.
 */
function guessQuery(path: string): string | null {
  const last = path.split('/').filter(Boolean).pop();
  if (!last) return null;
  let words: string;
  try {
    words = decodeURIComponent(last);
  } catch {
    return null;
  }
  words = words.replace(/[-_+.]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!/[a-z]{2}/i.test(words) || /^[0-9a-f-]{20,}$/i.test(last) || words.length > 60) return null;
  if (['title', 'movie', 'tv', 'user', 'artist', 'collection', 'watchlists', 'me', 'new'].includes(words.toLowerCase())) return null;
  return words;
}

/**
 * The 404's contents. The address and signed-in state are read here, in the
 * browser (usePathname + the hydrated auth store), never with headers() or
 * cookies() on the server: Next renders the root not-found as part of every
 * page's RSC payload, so a request read there turns the ISR title/artist
 * pages dynamic at runtime and they 500.
 */
export function NotFoundBody() {
  const path = usePathname() ?? '';
  const signedIn = useAuthStore((s) => s.status === 'authenticated');
  const guess = guessQuery(path);

  const links = signedIn
    ? [
        { href: '/discover', label: 'Discover' },
        { href: '/watchlists', label: 'Your watchlists' },
        { href: '/new', label: 'New & Coming Soon' },
      ]
    : [
        { href: '/', label: 'Watchly home' },
        { href: '/signin', label: 'Sign in' },
      ];

  return (
    <>
      <div className="in-[[data-app-shell]]:hidden">
        <Logo />
      </div>
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-8 py-12">
        <div className="flex flex-col gap-4">
          <Kicker>404 · Box office</Kicker>
          <Letterboard lines={['NOT', 'SHOWING']} />
        </div>

        <div className="flex flex-col gap-2">
          <h1 className="text-h2">This page isn&apos;t showing.</h1>
          <p className="text-body-regular text-muted-foreground">
            {path ? (
              <>
                There&apos;s nothing at <span className="break-all font-mono text-sm text-foreground">{path}</span>. The link may be old, or it has a typo.
              </>
            ) : (
              <>The link may be old, or it has a typo.</>
            )}
          </p>
        </div>

        <form action="/discover" method="get" role="search" className="flex flex-col gap-2">
          <label htmlFor="nf-q" className="type-kicker text-muted-foreground">
            {guess ? 'Were you looking for' : 'Find a film, show or person'}
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search size={16} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                key={path}
                id="nf-q"
                name="q"
                type="search"
                defaultValue={guess ?? ''}
                placeholder="Search titles, people"
                autoComplete="off"
                className="h-11 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <button type="submit" className="inline-flex h-11 cursor-pointer items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
              Search
            </button>
          </div>
        </form>

        <nav aria-label="Ways back" className="flex flex-col border-t border-dashed border-border">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="group flex items-center justify-between border-b border-border py-3 text-sm font-semibold text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
              {l.label}
              <ArrowRight size={14} aria-hidden className="text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary motion-reduce:transition-none" />
            </Link>
          ))}
        </nav>
      </div>
    </>
  );
}
