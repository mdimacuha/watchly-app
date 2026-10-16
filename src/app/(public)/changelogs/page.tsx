import type { Metadata } from 'next';
import { Anton } from 'next/font/google';
import { listChangelogs } from '@/services/changelog';
import { ChangelogRelease } from '@/components/changelog/ChangelogRelease';
import { cn } from '@/lib/cn';

export const metadata: Metadata = {
  title: "What's new · Watchly",
  description: 'Every improvement to Watchly, release by release.',
};

// The marketing site's display face — only this page pays for it.
const anton = Anton({ weight: '400', subsets: ['latin'], variable: '--font-anton' });

/**
 * Public release notes, rendered from /changelogs/*.md at build time.
 * Visual language follows gowatchly.com: Anton display headlines, mono
 * kickers, sharp editorial hairlines around app-radius product callouts.
 */
export default async function ChangelogsPage() {
  const releases = await listChangelogs();

  return (
    <div className={cn(anton.variable, 'mx-auto w-full max-w-5xl px-4 py-12 md:px-8 md:py-20')}>
      <header className="flex flex-col gap-6">
        <div className="flex items-baseline gap-4">
          <span className="type-kicker text-primary">Changelog</span>
          <span aria-hidden className="h-px flex-1 self-center bg-border" />
        </div>
        <h1 className="type-display text-6xl text-foreground md:text-8xl">
          What&apos;s new
          <br />
          on Watchly
        </h1>
        <p className="max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg">
          Everything we&apos;ve improved, fixed, and added — written for the people who use Watchly.
        </p>
      </header>

      {releases.length === 0 ? (
        <p className="mt-16 border-t border-border pt-10 text-muted-foreground">No releases yet. Check back soon.</p>
      ) : (
        <div className="mt-16 flex flex-col">
          {releases.map((release, i) => (
            <ChangelogRelease key={release.slug} release={release} latest={i === 0} />
          ))}
        </div>
      )}
    </div>
  );
}
