'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CircleHelp, Film, Heart, ThumbsUp, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Modal } from '@/components/ui/Modal';

// "How it works" for Watchly Swipe: what each verdict does, how undo works,
// and the controls for touch and keyboard. Opens on its own the first time
// someone visits; after that it's the button in the page header.

const SEEN_KEY = 'watchly.swipe.guide.seen';

const VERDICTS = [
  {
    name: 'Pass',
    Icon: X,
    disc: 'border-destructive/30 text-destructive',
    text: "Not for you. It won't come back, and picks like it show up less.",
  },
  {
    name: 'Like',
    Icon: ThumbsUp,
    disc: 'border-primary bg-primary text-primary-foreground',
    text: 'You’re into it. It shapes your picks and lands in the Likes tab on your profile. Your Favorites stay as they are.',
  },
  {
    name: 'Favorite',
    Icon: Heart,
    disc: 'border-primary/40 text-primary',
    text: 'You love it. It goes straight into your Favorites.',
  },
] as const;

const CONTROLS: { action: string; touch: string; keys: string[] }[] = [
  { action: 'Pass', touch: 'Swipe left', keys: ['←', 'X'] },
  { action: 'Like', touch: 'Swipe right', keys: ['→', 'L'] },
  { action: 'Favorite', touch: 'Tap the heart', keys: ['F', 'S'] },
  { action: 'Details', touch: 'Tap Details', keys: ['Enter'] },
  { action: 'Undo', touch: 'Pull the newest reel frame up, or Rewind', keys: ['Z', 'Backspace'] },
];

export function SwipeGuide() {
  const [open, setOpen] = useState(false);

  // First visit: show it once. Storage can be blocked; then it just doesn't auto-open.
  useEffect(() => {
    try {
      if (localStorage.getItem(SEEN_KEY)) return;
      localStorage.setItem(SEEN_KEY, '1');
    } catch {
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- client storage only
    setOpen(true);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border px-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground hover:bg-secondary/60 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <CircleHelp className="h-3.5 w-3.5" />
        How it works
      </button>

      <Modal
        isOpen={open}
        onClose={() => setOpen(false)}
        labelledBy="swipe-guide-title"
        className="max-w-lg border border-border bg-card"
      >
        <div className="flex flex-col gap-6 p-5 sm:p-6">
          <header className="pr-8">
            <h2 id="swipe-guide-title" className="text-lg font-bold tracking-tight">
              How Watchly Swipe works
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              One title at a time. Decide fast: every swipe teaches Watchly your taste, so{' '}
              <Link href="/for-you" className="text-foreground underline underline-offset-4" onClick={() => setOpen(false)}>
                For You
              </Link>{' '}
              and Tonight&apos;s Programme get sharper.
            </p>
          </header>

          <section aria-labelledby="swipe-guide-verdicts" className="flex flex-col gap-3">
            <h3 id="swipe-guide-verdicts" className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              Three verdicts
            </h3>
            <ul className="flex flex-col gap-3">
              {VERDICTS.map(({ name, Icon, disc, text }) => (
                <li key={name} className="flex items-start gap-3">
                  <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2', disc)}>
                    <Icon className="h-4 w-4" strokeWidth={2.5} />
                  </span>
                  <p className="text-sm">
                    <span className="font-semibold">{name}.</span> <span className="text-foreground/80">{text}</span>
                  </p>
                </li>
              ))}
            </ul>
            <p className="text-sm text-muted-foreground">
              Not sure yet? <span className="text-foreground">Details</span> opens the full info, and{' '}
              <span className="text-foreground">Add to watchlist</span> saves it for later without moving on.
            </p>
          </section>

          <section aria-labelledby="swipe-guide-reel" className="flex flex-col gap-2">
            <h3 id="swipe-guide-reel" className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              The reel
            </h3>
            <p className="flex items-start gap-2 text-sm text-foreground/80">
              <Film className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <span>
                Every card you swipe drops into the reel under the deck. Tap a frame to look at it again, or undo
                your last swipe. Changed your mind about an older one? Open{' '}
                <Link href="/swipe/history" className="text-foreground underline underline-offset-4" onClick={() => setOpen(false)}>
                  History
                </Link>
                .
              </span>
            </p>
          </section>

          <section aria-labelledby="swipe-guide-controls" className="flex flex-col gap-2">
            <h3 id="swipe-guide-controls" className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              Controls
            </h3>
            <table className="w-full text-sm">
              <thead className="sr-only">
                <tr>
                  <th>Action</th>
                  <th>Touch</th>
                  <th>Keyboard</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {CONTROLS.map((c) => (
                  <tr key={c.action}>
                    <th scope="row" className="w-20 py-2 pr-3 text-left font-semibold">
                      {c.action}
                    </th>
                    <td className="py-2 pr-3 text-foreground/80">{c.touch}</td>
                    <td className="py-2 text-right whitespace-nowrap">
                      {c.keys.map((k) => (
                        <kbd
                          key={k}
                          className="ml-1 inline-flex h-6 min-w-6 items-center justify-center rounded border border-border bg-secondary px-1.5 font-sans text-xs font-medium"
                        >
                          {k}
                        </kbd>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <button
            type="button"
            onClick={() => setOpen(false)}
            className="h-10 rounded-md bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary/90 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Start swiping
          </button>
        </div>
      </Modal>
    </>
  );
}
