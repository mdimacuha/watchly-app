'use client';

import { useState } from 'react';
import { EyeOff } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * A review body that may be marked as a spoiler. Spoilers stay out of the
 * DOM until the reader asks for them (no blur: blurred text is still read
 * out and copied), then render as normal text.
 */
export function SpoilerText({
  text,
  isSpoiler,
  className,
  clampClassName,
}: {
  text: string;
  isSpoiler: boolean;
  /** Classes for the revealed text. */
  className?: string;
  /** Extra classes for the text while collapsed (e.g. a line clamp). */
  clampClassName?: string;
}) {
  const [revealed, setRevealed] = useState(false);

  if (isSpoiler && !revealed) {
    return (
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
        <EyeOff className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>This review contains spoilers.</span>
        <button
          type="button"
          onClick={() => setRevealed(true)}
          className="font-semibold text-foreground underline-offset-4 hover:underline cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
        >
          Show review
        </button>
      </p>
    );
  }
  return <p className={cn('whitespace-pre-line', className, !revealed && clampClassName)}>{text}</p>;
}
