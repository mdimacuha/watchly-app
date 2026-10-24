import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { render } from '@react-email/components';
import { cn } from '@/lib/cn';
import { anton } from '@/lib/fonts';
import { env } from '@/env';
import { EMAIL_PREVIEWS, findEmailPreview } from '../registry';
import { EmailPreviewFrame } from './EmailPreviewFrame';

interface PageProps {
  params: Promise<{ slug: string }>;
}

/**
 * One email, rendered with the same `render()` the real send path uses, in
 * an iframe so the host page's styles can't bleed in. Alongside it: the
 * inbox line (from, subject), phone and desktop widths, and the plain-text
 * part every email also ships with.
 */
export default async function EmailPreviewPage({ params }: PageProps) {
  const { slug } = await params;
  const entry = findEmailPreview(slug);
  if (!entry) notFound();

  const [html, text] = await Promise.all([render(entry.element), render(entry.element, { plainText: true })]);
  const at = EMAIL_PREVIEWS.findIndex((e) => e.slug === slug);
  const prev = EMAIL_PREVIEWS[at - 1];
  const next = EMAIL_PREVIEWS[at + 1];

  return (
    <div className={cn(anton.variable, 'min-h-screen bg-background text-foreground')}>
      <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-10 sm:px-6">
        <Link href="/debug/emails" className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          All templates
        </Link>

        <header className="flex flex-col gap-3 border-b-2 border-foreground pb-6">
          <p className="type-kicker text-muted-foreground">
            Email {String(at + 1).padStart(2, '0')} / {String(EMAIL_PREVIEWS.length).padStart(2, '0')} · {entry.slug}
          </p>
          <h1 className="type-display text-5xl text-foreground sm:text-6xl">{entry.name}</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">{entry.description}</p>
        </header>

        {/* The inbox line, as the person sees it before opening. */}
        <dl className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-4 gap-y-1.5 rounded-xl border border-border bg-card px-5 py-4 text-sm">
          <dt className="type-kicker pt-0.5 text-muted-foreground">From</dt>
          <dd className="truncate text-foreground">{env.EMAIL_FROM}</dd>
          <dt className="type-kicker pt-0.5 text-muted-foreground">Subject</dt>
          <dd className="font-semibold text-foreground">{entry.subject}</dd>
        </dl>

        <EmailPreviewFrame html={html} text={text} title={`${entry.name} preview`} />

        <nav className="flex items-center justify-between gap-4 border-t border-border pt-6 text-sm">
          {prev ? (
            <Link href={`/debug/emails/${prev.slug}`} className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" aria-hidden /> {prev.name}
            </Link>
          ) : (
            <span />
          )}
          {next && (
            <Link href={`/debug/emails/${next.slug}`} className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground">
              {next.name} <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          )}
        </nav>
      </div>
    </div>
  );
}
