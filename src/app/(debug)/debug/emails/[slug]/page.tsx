import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { render } from '@react-email/components';
import { findEmailPreview } from '../registry';

interface PageProps {
  params: Promise<{ slug: string }>;
}

/**
 * Renders one email template inside an iframe using the same async
 * `render()` call the real `sendMail` path uses. iframe `srcDoc` keeps
 * the email's CSS scoped — the host page's Tailwind/dark theme can't
 * bleed into the preview, so what you see here is what the client will
 * render.
 */
export default async function EmailPreviewPage({ params }: PageProps) {
  const { slug } = await params;
  const entry = findEmailPreview(slug);
  if (!entry) notFound();

  const html = await render(entry.element);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="container mx-auto max-w-4xl px-6 py-8 flex flex-col gap-4">
        <Link
          href="/debug/emails"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
        >
          <ArrowLeft className="w-4 h-4" />
          All templates
        </Link>

        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <h1 className="text-h2">{entry.name}</h1>
          <code className="text-xs text-muted-foreground">{entry.slug}</code>
        </div>
        <p className="text-sm text-foreground/80">
          Subject: <span className="font-medium">{entry.subject}</span>
        </p>
        <p className="text-xs text-muted-foreground">{entry.description}</p>

        <div className="rounded-xl border border-border overflow-hidden bg-card">
          <iframe
            srcDoc={html}
            title={`${entry.name} preview`}
            className="w-full block"
            style={{ height: '760px', border: 0 }}
          />
        </div>
      </div>
    </div>
  );
}
