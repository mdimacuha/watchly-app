import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import { anton } from '@/lib/fonts';
import { EMAIL_PREVIEWS } from './registry';

export const metadata = {
  title: 'Email Templates · Watchly Debug',
};

/**
 * Dev-only gallery of every email, in the order a person receives them.
 * Each one opens an isolated preview (iframe, real inline styles) with its
 * plain-text part. Gated by `devOnlyRoutes` in `src/lib/routes.ts`.
 */
export default function EmailPreviewIndexPage() {
  return (
    <div className={cn(anton.variable, 'min-h-screen bg-background text-foreground')}>
      <div className="mx-auto flex max-w-3xl flex-col px-4 py-12 sm:px-6">
        <header className="flex items-end justify-between gap-4 border-b-2 border-foreground pb-6">
          <div>
            <p className="type-kicker text-muted-foreground">Debug · mail room</p>
            <h1 className="type-display mt-3 text-6xl text-foreground sm:text-7xl">Email templates</h1>
          </div>
          <p className="hidden max-w-48 text-right text-sm text-muted-foreground sm:block">Every email Watchly sends, with sample data, as an inbox renders it.</p>
        </header>

        <ol className="flex flex-col">
          {EMAIL_PREVIEWS.map((e, i) => (
            <li key={e.slug}>
              <Link
                href={`/debug/emails/${e.slug}`}
                className="group grid grid-cols-[3.25rem_minmax(0,1fr)_auto] items-start gap-x-4 border-b border-border py-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:grid-cols-[4.5rem_minmax(0,1fr)_auto]"
              >
                <span aria-hidden className="type-display text-5xl text-muted-foreground transition-colors group-hover:text-primary sm:text-6xl">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="flex min-w-0 flex-col gap-1.5 pt-1">
                  <span className="text-xl font-bold text-foreground sm:text-2xl">{e.name}</span>
                  <span className="truncate font-mono text-xs uppercase tracking-wider text-muted-foreground">{e.subject}</span>
                  <span className="text-sm text-muted-foreground">{e.description}</span>
                </span>
                <ArrowRight size={18} aria-hidden className="mt-3 text-muted-foreground transition-colors group-hover:text-foreground" />
              </Link>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
