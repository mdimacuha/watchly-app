'use client';

import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
} from 'react';
import Image from 'next/image';
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type PanInfo,
} from 'framer-motion';
import { Heart, Sparkles, ThumbsUp, X } from 'lucide-react';
import { buildImageUrl } from '@/lib/tmdb';
import { cn } from '@/lib/cn';
import type { SwipeDeckItem } from '@/services/swipe';

export type SwipeDirection = 'left' | 'right' | 'up';

/** Imperative handle so buttons / keys play the same exit as a drag. */
export interface SwipeCardHandle {
  swipe: (direction: SwipeDirection) => void;
}

interface SwipeCardProps {
  item: SwipeDeckItem;
  /**
   * Called once the exit animation finishes. `viaDrag` = gesture commit.
   * Return false if the deck refused it — the card then resets to center
   * instead of staying stranded off-screen.
   */
  onSwipe: (direction: SwipeDirection, viaDrag: boolean) => boolean;
  /** Top-of-stack card has interactive drag. Others render frozen. */
  active?: boolean;
  /** Animate in from this side on mount (Undo returning the card). */
  enterFrom?: SwipeDirection;
  /** Checked on drag release: false springs the card back instead of
   *  flying it off (the deck is mid-commit). Drag itself stays enabled so
   *  the card never feels frozen. */
  canCommit?: () => boolean;
  ref?: Ref<SwipeCardHandle>;
}

// Commit threshold scales with card width (a fixed 110px felt stiff on a
// 512px desktop card and was a third of a phone card).
const THRESHOLD_RATIO = 0.25;
const THRESHOLD_MIN = 80;
const THRESHOLD_MAX = 140;
const FLICK_VELOCITY = 800;
// How long a button/key swipe holds the stamp "armed" before flying off,
// so the user sees which verdict they just gave.
const ARM_MS = 0.14;

/**
 * Single deck card. The active card is dragged via framer-motion;
 * inactive cards underneath render at a slight scale/offset to suggest
 * a stack.
 *
 * Feedback:
 *   - The card tracks the pointer 1:1, rotating toward the drag direction.
 *   - Pass / Like stamps fade to FULL exactly at the commit threshold.
 *   - Every commit — drag, button or key — plays the same exit: the stamp
 *     arms, then the card flies off (left = pass, right = like, up =
 *     favorite). Reduced motion swaps this for a quick fade.
 */
export function SwipeCard({
  item,
  onSwipe,
  active = true,
  enterFrom,
  canCommit,
  ref,
}: SwipeCardProps) {
  const reduceMotion = useReducedMotion();
  const cardRef = useRef<HTMLDivElement>(null);
  const thresholdRef = useRef(110);

  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const opacity = useMotionValue(1);
  const rotate = useTransform(x, [-200, 0, 200], reduceMotion ? [0, 0, 0] : [-12, 0, 12]);
  // Function transforms read the live threshold (card width can change).
  const passOpacity = useTransform(x, (v) => clamp01(-v / thresholdRef.current));
  const likeOpacity = useTransform(x, (v) => clamp01(v / thresholdRef.current));
  const favoriteOpacity = useTransform(y, (v) => clamp01(-v / thresholdRef.current));

  // Guards a second commit and disables drag mid-flight. The ref is the
  // synchronous source of truth; the state re-renders drag off.
  const committingRef = useRef(false);
  const [committing, setCommitting] = useState(false);

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const measure = () => {
      thresholdRef.current = Math.min(
        THRESHOLD_MAX,
        Math.max(THRESHOLD_MIN, el.offsetWidth * THRESHOLD_RATIO),
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // The peeking card underneath sits dimmed; it brightens when it becomes
  // the top card. (Opacity is a motion value so the reduced-motion exit
  // fade can drive it too.)
  useEffect(() => {
    if (committingRef.current) return;
    animate(opacity, active ? 1 : 0.7, { duration: 0.2 });
  }, [active, opacity]);

  // Undo: slide the restored card back in from the side it left.
  useEffect(() => {
    if (!enterFrom || !active) return;
    if (reduceMotion) {
      opacity.set(0);
      animate(opacity, 1, { duration: 0.15 });
      return;
    }
    const [fromX, fromY] = offscreen(enterFrom);
    x.set(fromX);
    y.set(fromY);
    animate(x, 0, { type: 'spring', stiffness: 280, damping: 28 });
    animate(y, 0, { type: 'spring', stiffness: 280, damping: 28 });
    // Mount-only: enterFrom is fixed for this card instance (keyed).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const flyOff = async (direction: SwipeDirection, viaDrag: boolean) => {
    if (committingRef.current) return;
    committingRef.current = true;
    setCommitting(true);

    if (reduceMotion) {
      await animate(opacity, 0, { duration: 0.15 });
      if (!onSwipe(direction, viaDrag)) reset();
      return;
    }

    const t = thresholdRef.current;
    const axis = direction === 'up' ? y : x;
    const sign = direction === 'left' || direction === 'up' ? -1 : 1;
    // Button/key commits start at rest: arm the stamp first so the verdict
    // is visible, then exit. Drag commits are already past the threshold.
    if (!viaDrag) {
      await animate(axis, sign * t, { duration: ARM_MS, ease: 'easeOut' });
    }
    const [toX, toY] = offscreen(direction);
    await animate(axis, direction === 'up' ? toY : toX, {
      type: 'tween',
      duration: 0.3,
      ease: 'easeIn',
    });
    if (!onSwipe(direction, viaDrag)) reset();
  };

  // Safety net: if the deck refused the commit, bring the card back and
  // re-enable drag rather than leave it stuck off-screen.
  const reset = () => {
    x.set(0);
    y.set(0);
    opacity.set(0);
    animate(opacity, 1, { duration: 0.15 });
    committingRef.current = false;
    setCommitting(false);
  };

  useImperativeHandle(ref, () => ({ swipe: (d) => void flyOff(d, false) }));

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    if (!active || committingRef.current) return;
    const springBack = () => animate(x, 0, { type: 'spring', stiffness: 280, damping: 26 });
    // Deck mid-commit (cooldown): don't fly off into a refusal.
    if (canCommit && !canCommit()) {
      springBack();
      return;
    }
    const t = thresholdRef.current;
    const { x: dx } = info.offset;
    const { x: vx } = info.velocity;
    // A flick commits only in the direction the card actually moved — a
    // fast release while dragging back toward center shouldn't fire.
    if (dx > t || (vx > FLICK_VELOCITY && dx > 0)) {
      void flyOff('right', true);
    } else if (dx < -t || (vx < -FLICK_VELOCITY && dx < 0)) {
      void flyOff('left', true);
    } else {
      animate(x, 0, { type: 'spring', stiffness: 280, damping: 26 });
    }
  };

  const posterUrl = buildImageUrl(item.posterPath, 'w500');

  return (
    <motion.div
      ref={cardRef}
      // The peeking card underneath is decorative — keep it out of the
      // accessibility tree so its title isn't announced too.
      aria-hidden={!active}
      className={cn(
        // touch-pan-y: horizontal drags go to the card, vertical swipes
        // still scroll the page on touch.
        'absolute inset-0 select-none touch-pan-y',
        active ? 'cursor-grab active:cursor-grabbing' : 'pointer-events-none',
      )}
      drag={active && !committing ? 'x' : false}
      dragMomentum={false}
      onDragEnd={handleDragEnd}
      // Mouse drag fix: stop the browser's native image drag (ghost image)
      // from hijacking the pointer before framer's drag starts.
      onDragStartCapture={(e) => e.preventDefault()}
      style={{ x, y, rotate, opacity }}
      initial={false}
      animate={{ scale: active ? 1 : 0.95 }}
      transition={{ type: 'spring', stiffness: 280, damping: 26 }}
    >
      <div className="relative w-full h-full rounded-xl overflow-hidden bg-card shadow-elevation-card">
        {posterUrl ? (
          <Image
            src={posterUrl}
            alt={item.title}
            fill
            draggable={false}
            className="object-cover pointer-events-none"
            sizes="(max-width: 640px) 100vw, 500px"
            priority={active}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-secondary">
            <span className="text-muted-foreground text-sm">No poster</span>
          </div>
        )}

        {/* Top-left chip cluster: type badge + optional Wildcard tag
            when the card was injected from the exploration pool. */}
        <div className="absolute top-3 left-3 flex items-center gap-1.5">
          <span className="inline-flex items-center px-1.5 py-0.5 bg-black/60 backdrop-blur-sm rounded text-[10px] uppercase font-bold text-white tracking-wider">
            {item.mediaType === 'movie' ? 'Movie' : 'TV'}
          </span>
          {item.isWildcard && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-yellow-500/90 text-yellow-950 text-[10px] uppercase font-bold tracking-wider shadow-sm">
              <Sparkles className="w-3 h-3" strokeWidth={2.5} />
              Wildcard
            </span>
          )}
        </div>

        {/* Verdict stamps — below the chip cluster so they don't overlap.
            Armed by drag distance, or briefly by a button/key commit. */}
        <motion.div
          style={{ opacity: passOpacity }}
          className="absolute top-14 left-6 px-3 py-1.5 rounded-md border-2 border-destructive bg-background/80 backdrop-blur text-destructive text-xs font-bold uppercase tracking-widest flex items-center gap-1 -rotate-12"
        >
          <X className="w-3.5 h-3.5" strokeWidth={3} />
          Pass
        </motion.div>
        <motion.div
          style={{ opacity: likeOpacity }}
          className="absolute top-14 right-6 px-3 py-1.5 rounded-md border-2 border-primary bg-background/80 backdrop-blur text-primary text-xs font-bold uppercase tracking-widest flex items-center gap-1 rotate-12"
        >
          <ThumbsUp className="w-3.5 h-3.5" strokeWidth={3} />
          Like
        </motion.div>
        <motion.div
          style={{ opacity: favoriteOpacity }}
          className="absolute top-1/3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-md border-2 border-primary bg-primary text-primary-foreground text-xs font-bold uppercase tracking-widest flex items-center gap-1"
        >
          <Heart className="w-3.5 h-3.5 fill-current" strokeWidth={3} />
          Favorite
        </motion.div>

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
            <p className="text-xs uppercase tracking-wider text-primary mt-3 font-semibold">
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

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/** Off-screen [x, y] for an exit/entry direction. */
function offscreen(direction: SwipeDirection): [number, number] {
  const w = typeof window !== 'undefined' ? window.innerWidth : 600;
  const h = typeof window !== 'undefined' ? window.innerHeight : 900;
  if (direction === 'up') return [0, -(h + 200)];
  return [direction === 'right' ? w + 200 : -(w + 200), 0];
}
