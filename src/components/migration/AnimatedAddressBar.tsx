'use client';

import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Lock } from 'lucide-react';
import { cn } from '@/lib/cn';

const TYPE_INTERVAL_MS = 85;

interface AnimatedAddressBarProps {
  /** The URL text typed out into the bar, e.g. "app.gowatchly.com". */
  url: string;
  className?: string;
}

/**
 * A faux browser address bar that types out `url` character by character with a
 * blinking caret — a small "this is your new address" flourish for the
 * migration modal. Respects `prefers-reduced-motion` by showing the full URL
 * immediately with no caret animation.
 */
export function AnimatedAddressBar({ url, className }: AnimatedAddressBarProps) {
  const reduce = useReducedMotion();
  const [count, setCount] = useState(reduce ? url.length : 0);

  useEffect(() => {
    if (reduce) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCount(url.length);
      return;
    }
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setCount(i);
      if (i >= url.length) clearInterval(id);
    }, TYPE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [url, reduce]);

  const typed = url.slice(0, count);

  return (
    <div
      className={cn(
        'flex items-center gap-2.5 rounded-full border border-border/60 bg-background/80 px-4 py-2.5 shadow-sm backdrop-blur-sm',
        className,
      )}
    >
      {/* Faux traffic lights */}
      <span className="hidden items-center gap-1.5 pr-1 sm:flex" aria-hidden>
        <span className="h-3 w-3 rounded-full bg-muted-foreground/30" />
        <span className="h-3 w-3 rounded-full bg-muted-foreground/30" />
        <span className="h-3 w-3 rounded-full bg-muted-foreground/30" />
      </span>

      <Lock className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />

      {/* Announce the full URL to AT; the typed spans are decorative. */}
      <span className="font-mono text-base text-foreground" aria-label={url}>
        <span aria-hidden>{typed}</span>
        {!reduce && (
          <motion.span
            aria-hidden
            className="ml-px inline-block text-primary"
            animate={{ opacity: [1, 1, 0, 0] }}
            transition={{
              duration: 1,
              repeat: Infinity,
              ease: 'linear',
              times: [0, 0.5, 0.5, 1],
            }}
          >
            |
          </motion.span>
        )}
      </span>
    </div>
  );
}
