import type { Metadata } from 'next';
import { anton } from '@/lib/fonts';
import { cn } from '@/lib/cn';
import { NotFoundBody } from '@/components/watchly/NotFoundBody';

export const metadata: Metadata = {
  title: 'Not showing',
  robots: { index: false, follow: false },
};

/**
 * The app's 404: a letterboard that reads NOT SHOWING, the address that
 * missed, a search (pre-filled from the link's words when it has any) and
 * the ways back.
 *
 * Keep this file static — no headers(), cookies() or session. Next renders it
 * into every page's RSC payload (as the not-found boundary), so a request read
 * here makes the ISR title/artist pages fail with "Page changed from static
 * to dynamic at runtime". The path and signed-in state are read client-side
 * in <NotFoundBody>.
 */
export default function NotFound() {
  return (
    // Inside an app frame (sidebar or top bar, both [data-app-shell]) the
    // frame already carries the logo and the height; standalone, this does.
    <main className={cn(anton.variable, 'flex min-h-dvh flex-col bg-background px-4 py-6 text-foreground sm:px-8 in-[[data-app-shell]]:min-h-0')}>
      <NotFoundBody />
    </main>
  );
}
