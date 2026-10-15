'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';
import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type PanInfo,
} from 'framer-motion';
import { Heart, X, Bookmark, Sparkles } from 'lucide-react';
import { buildImageUrl } from '@/lib/tmdb';
import { cn } from '@/lib/cn';
import type { SwipeDeckItem } from '@/services/swipe';

interface SwipeCardProps {
  item: SwipeDeckItem;
  /** Drag distance past which a release commits as a swipe. */
  threshold?: number;
  /** Called on commit-left. */
  onSwipeLeft: () => void;
  /** Called on commit-right. */
  onSwipeRight: () => void;
  /** Top-of-stack card has interactive drag. Others render frozen. */
  active?: boolean;
}

const DEFAULT_THRESHOLD = 110;

/**
 * Single deck card. The active card is dragged via framer-motion;
 * inactive cards underneath render at a slight scale/offset to suggest
 * a stack.
 *
 * Visual feedback during drag:
 *   - The card tracks the pointer 1:1 (no drag constraints / elastic), so
 *     the commit metric (`info.offset.x`) matches what the user sees.
 *   - Card rotates slightly toward the drag direction.
 *   - Pass / Like badge overlays fade to FULL exactly at `threshold` — the
 *     same distance that commits — so the badge reads as "armed" on release.
 *   - Sub-threshold release springs the card smoothly back to center.
 *   - On commit, the card flies off-screen in the drag direction, then
 *     invokes the swipe callback so the parent advances the stack.
 */
export function SwipeCard({
  item,
  threshold = DEFAULT_THRESHOLD,
  onSwipeLeft,
  onSwipeRight,
  active = true,
}: SwipeCardProps) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 0, 200], [-12, 0, 12]);
  const passOpacity = useTransform(x, [-threshold, -threshold * 0.4, 0], [1, 0.6, 0]);
  const likeOpacity = useTransform(x, [0, threshold * 0.4, threshold], [0, 0.6, 1]);

  // Once a swipe commits we play a fly-off animation and only THEN tell the
  // parent (which advances/records). `committing` both guards against a
  // second commit and disables drag so the airborne card can't be re-grabbed
  // mid-flight. The ref is the synchronous source of truth; the state exists
  // to disable the drag gesture on re-render.
  const committingRef = useRef(false);
  const [committing, setCommitting] = useState(false);

  const posterUrl = buildImageUrl(item.posterPath, 'w500');

  const flyOff = (direction: 1 | -1) => {
    if (committingRef.current) return;
    committingRef.current = true;
    setCommitting(true);
    const viewport = typeof window !== 'undefined' ? window.innerWidth : 600;
    animate(x, direction * (viewport + 200), {
      type: 'tween',
      duration: 0.3,
      ease: 'easeOut',
      onComplete: () => {
        if (direction === 1) onSwipeRight();
        else onSwipeLeft();
      },
    });
  };

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    if (!active || committingRef.current) return;
    if (info.offset.x > threshold || info.velocity.x > 800) {
      flyOff(1);
    } else if (info.offset.x < -threshold || info.velocity.x < -800) {
      flyOff(-1);
    } else {
      // Sub-threshold release: spring smoothly back to center.
      animate(x, 0, { type: 'spring', stiffness: 280, damping: 26 });
    }
  };

  return (
    <motion.div
      className={cn(
        'absolute inset-0 select-none',
        active ? 'cursor-grab active:cursor-grabbing' : 'pointer-events-none',
      )}
      drag={active && !committing ? 'x' : false}
      dragMomentum={false}
      onDragEnd={handleDragEnd}
      style={{ x, rotate }}
      initial={false}
      animate={{ scale: active ? 1 : 0.95, opacity: active ? 1 : 0.7 }}
      transition={{ type: 'spring', stiffness: 280, damping: 26 }}
    >
      <div className="relative w-full h-full rounded-xl overflow-hidden bg-card shadow-elevation-card">
        {posterUrl ? (
          <Image
            src={posterUrl}
            alt={item.title}
            fill
            className="object-cover"
            sizes="(max-width: 640px) 100vw, 500px"
            priority={active}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-secondary">
            <span className="text-muted-foreground text-sm">No poster</span>
          </div>
        )}

        {/* Pass / Like overlays — fade in as you drag past the commit
            threshold so the user gets visual feedback before release. */}
        <motion.div
          style={{ opacity: passOpacity }}
          className="absolute top-6 left-6 px-3 py-1.5 rounded-md border-2 border-destructive bg-background/80 backdrop-blur text-destructive text-xs font-bold uppercase tracking-widest flex items-center gap-1 -rotate-12"
        >
          <X className="w-3.5 h-3.5" strokeWidth={3} />
          Pass
        </motion.div>
        <motion.div
          style={{ opacity: likeOpacity }}
          className="absolute top-6 right-6 px-3 py-1.5 rounded-md border-2 border-primary bg-background/80 backdrop-blur text-primary text-xs font-bold uppercase tracking-widest flex items-center gap-1 rotate-12"
        >
          <Heart className="w-3.5 h-3.5" strokeWidth={3} />
          Like
        </motion.div>

        {/* Top-left chip cluster: type badge + optional Wildcard tag
            when the card was injected from the exploration pool. */}
        <div className="absolute top-3 left-3 flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-black/60 backdrop-blur-sm rounded text-[10px] uppercase font-bold text-white tracking-wider">
            <Bookmark className="w-3 h-3" />
            {item.mediaType === 'movie' ? 'Movie' : 'TV'}
          </span>
          {item.isWildcard && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-yellow-500/90 text-yellow-950 text-[10px] uppercase font-bold tracking-wider shadow-sm">
              <Sparkles className="w-3 h-3" strokeWidth={2.5} />
              Wildcard
            </span>
          )}
        </div>

        {/* Bottom gradient + meta — always rendered on the active card
            so the user can read title/year/reason without dragging. */}
        <div className="absolute inset-x-0 bottom-0 p-5 pt-16 bg-gradient-to-t from-black/95 via-black/70 to-transparent text-white">
          <h2 className="text-2xl font-bold leading-tight">{item.title}</h2>
          <div className="flex items-center gap-2 mt-1 text-xs text-white/80">
            {item.year && <span>{item.year}</span>}
            {item.voteAverage !== null && (
              <>
                <span>·</span>
                <span>★ {item.voteAverage.toFixed(1)}</span>
              </>
            )}
            {item.genres.length > 0 && (
              <>
                <span>·</span>
                <span className="truncate">
                  {item.genres
                    .map((g) => g.name)
                    .slice(0, 2)
                    .join(', ')}
                </span>
              </>
            )}
          </div>
          {item.reason && (
            <p className="text-[11px] uppercase tracking-wider text-primary/90 mt-3 font-semibold">
              {item.reason}
            </p>
          )}
          {item.overview && (
            <p className="text-sm text-white/85 mt-2 line-clamp-3 leading-relaxed">
              {item.overview}
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
}
