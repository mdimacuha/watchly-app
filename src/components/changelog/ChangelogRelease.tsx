import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { tokenizeInline, type Changelog, type ChangelogBlock } from '@/services/changelog';

/**
 * One release on /changelogs: a sticky date rail on the left, then the
 * release headline, its promo callout, and the changes grouped by area of
 * the app (## Area → ### Feature → bullets).
 */
export function ChangelogRelease({ release, latest }: { release: Changelog; latest: boolean }) {
  return (
    <article id={release.slug} className="scroll-mt-24 border-t border-border py-12 md:grid md:grid-cols-4 md:gap-10 md:py-16">
      <div className="mb-6 md:mb-0">
        <div className="flex flex-wrap items-center gap-3 md:sticky md:top-24 md:flex-col md:items-start">
          <a href={`#${release.slug}`} className="type-kicker text-muted-foreground transition-colors hover:text-foreground">
            <time dateTime={release.date}>{formatDate(release.date)}</time>
          </a>
          {latest && (
            <span className="type-kicker rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-primary">Latest</span>
          )}
        </div>
      </div>

      <div className="min-w-0 md:col-span-3">
        <h2 className="type-display text-4xl text-foreground md:text-6xl">{release.title}</h2>
        {release.summary && (
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">
            <Inline text={release.summary} />
          </p>
        )}

        {release.promo && (
          <aside className="mt-8 flex flex-col gap-4 rounded-xl border border-border bg-card p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="font-bold tracking-tight">{release.promo.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{release.promo.description}</p>
            </div>
            <Link
              href={release.promo.ctaHref}
              className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:self-auto"
            >
              {release.promo.ctaLabel}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </aside>
        )}

        <div className="mt-12 flex flex-col gap-12">
          {release.areas.map((area, i) => (
            <section key={area.title} aria-labelledby={`${release.slug}-${i}`}>
              <div className="flex items-baseline gap-4">
                <span className="type-kicker text-primary">{String(i + 1).padStart(2, '0')}</span>
                <h3 id={`${release.slug}-${i}`} className="type-kicker text-foreground">
                  {area.title}
                </h3>
                <span aria-hidden className="h-px flex-1 self-center bg-border" />
              </div>
              <div className="mt-5 flex flex-col gap-6">
                {area.features.map((feature, j) => (
                  <div key={j}>
                    {feature.title && <h4 className="text-lg font-bold tracking-tight text-foreground">{feature.title}</h4>}
                    {feature.blocks.map((block, k) => (
                      <Block key={k} block={block} />
                    ))}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </article>
  );
}

function Block({ block }: { block: ChangelogBlock }) {
  if (block.type === 'p') {
    return (
      <p className="mt-2 max-w-2xl leading-relaxed text-muted-foreground">
        <Inline text={block.text} />
      </p>
    );
  }
  return (
    <ul className="mt-2 flex max-w-2xl flex-col gap-2">
      {block.items.map((item, i) => (
        <li key={i} className="relative pl-5 leading-relaxed text-muted-foreground">
          <span aria-hidden className="absolute left-0 top-2.5 h-px w-2.5 bg-primary" />
          <Inline text={item} />
        </li>
      ))}
    </ul>
  );
}

function Inline({ text }: { text: string }) {
  return (
    <>
      {tokenizeInline(text).map((t, i) => {
        if (t.type === 'bold') return <strong key={i} className="font-semibold text-foreground">{t.value}</strong>;
        if (t.type === 'code') return <code key={i} className="rounded bg-secondary px-1 py-0.5 font-mono text-sm text-foreground">{t.value}</code>;
        if (t.type === 'link') {
          const internal = t.href.startsWith('/') && !t.href.startsWith('//');
          if (!internal && !/^https?:\/\//.test(t.href)) return <span key={i}>{t.value}</span>;
          return internal ? (
            <Link key={i} href={t.href} className="text-primary underline-offset-4 hover:underline">{t.value}</Link>
          ) : (
            <a key={i} href={t.href} target="_blank" rel="noopener noreferrer" className="text-primary underline-offset-4 hover:underline">{t.value}</a>
          );
        }
        return <span key={i}>{t.value}</span>;
      })}
    </>
  );
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}
