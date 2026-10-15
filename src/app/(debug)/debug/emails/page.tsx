import Link from 'next/link';
import { Mail } from 'lucide-react';
import { EMAIL_PREVIEWS } from './registry';

export const metadata = {
  title: 'Email Templates · Watchly Debug',
};

/**
 * Dev-only email template gallery. Lists every entry in the email
 * registry; clicking through opens an isolated preview that renders the
 * template inside an iframe so inline styles read the same as they would
 * in a real client.
 *
 * Gated by `devOnlyRoutes` in `src/lib/routes.ts` — the middleware
 * returns 404 outside development.
 */
export default function EmailPreviewIndexPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="container mx-auto max-w-3xl px-6 py-12 flex flex-col gap-6">
        <div className="flex items-center gap-3">
          <Mail size={22} className="text-primary" />
          <h1 className="text-h2">Email Templates</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Preview every transactional + marketing email with sample data.
          Each preview renders inside an iframe with the real inline
          styles so layout regressions surface here before they hit a
          real inbox.
        </p>

        <ul className="flex flex-col gap-2 mt-2">
          {EMAIL_PREVIEWS.map((e) => (
            <li key={e.slug}>
              <Link
                href={`/debug/emails/${e.slug}`}
                className="block rounded-lg border border-border p-4 hover:border-foreground/40 hover:bg-card/60 transition-colors"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-base font-semibold text-foreground">
                    {e.name}
                  </span>
                  <code className="text-xs text-muted-foreground">
                    {e.slug}
                  </code>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {e.description}
                </p>
                <p className="text-xs text-foreground/70 mt-2">
                  Subject:{' '}
                  <span className="text-foreground">{e.subject}</span>
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
