'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

const ROTATE_MS = 5000;

/**
 * Cross-fading TMDB backdrop stills behind the migration modal content.
 *
 * Uses the TitleHero recipe — dimmed `object-cover` image + gradient overlays
 * that fade into the card surface so foreground text stays legible. Renders
 * gradient-only when `images` is empty (fetch failed / still loading), so the
 * modal never depends on the network. Static (first image only) under
 * reduced-motion.
 */
export function MigrationBackdrop({ images }: { images: string[] }) {
  const reduce = useReducedMotion();
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (reduce || images.length <= 1) return;
    const id = setInterval(
      () => setIndex((i) => (i + 1) % images.length),
      ROTATE_MS,
    );
    return () => clearInterval(id);
  }, [reduce, images.length]);

  const current = images[index];

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {current && (
        <AnimatePresence mode="sync">
          <motion.div
            key={current}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.2, ease: 'easeInOut' }}
            className="absolute inset-0"
          >
            <Image
              src={current}
              alt=""
              fill
              priority
              sizes="(max-width: 640px) 100vw, 640px"
              className="object-cover opacity-25"
            />
          </motion.div>
        </AnimatePresence>
      )}

      {/* Fade the still into the card surface, top-down + corners. */}
      <div className="absolute inset-0 bg-linear-to-t from-card via-card/90 to-card/40" />
      <div className="absolute inset-0 bg-linear-to-br from-card/80 via-transparent to-card/80" />
    </div>
  );
}
