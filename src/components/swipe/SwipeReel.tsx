'use client';

import Image from 'next/image';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Film, Heart, RotateCcw, ThumbsUp, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { buildImageUrl } from '@/lib/tmdb';
import type { SwipeDeckItem } from '@/services/swipe';

export type ReelVerdict = 'liked' | 'passed' | 'saved';

export interface ReelFrame {
  /** Unique per swipe (the same title can be swiped again after undo). */
  key: string;
  item: SwipeDeckItem;
  verdict: ReelVerdict;
}

interface SwipeReelProps {
  /** This session's swipes, newest first. */
  frames: ReelFrame[];
  /** Single-step undo is available (only ever the newest frame). */
  canUndo: boolean;
  onUndo: () => void;
  /** Open a frame's title in Quick View. */
  onOpen: (item: SwipeDeckItem) => void;
  /** Cards left in the deck. */
  remaining: number;
}

/** Frames kept on screen; older ones scroll off the end of the reel. */
const MAX_FRAMES = 50;
/** How far the newest frame must be pulled up to count as an undo. */
const PULL_TO_UNDO_PX = 40;

const VERDICT: Record<ReelVerdict, { label: string; icon: typeof X; tone: string }> = {
  passed: { label: 'Passed', icon: X, tone: 'text-destructive' },
  liked: { label: 'Liked', icon: ThumbsUp, tone: 'text-primary' },
  saved: { label: 'Favorited', icon: Heart, tone: 'text-primary' },
};

/**
 * The session reel under the swipe deck: every swiped card drops into a
 * sprocketed film strip, newest on the left, tinted by verdict (pass
 * dimmed, like outlined, favorite lit) and captioned. It is the deck's
 * feedback, session history and undo in one object:
 *   - tap a frame → Quick View
 *   - Rewind, Z, or pulling the newest frame back up → undo
 */
export function SwipeReel({ frames, canUndo, onUndo, onOpen, remaining }: SwipeReelProps) {
  const reduceMotion = useReducedMotion();
  const visible = frames.slice(0, MAX_FRAMES);
  const newest = frames[0];
  const count = (v: ReelVerdict) => frames.filter((f) => f.verdict === v).length;

  return (
    <section aria-label="Swipe reel" className="w-full max-w-lg mx-auto">
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5 font-semibold uppercase tracking-widest">
          <Film className="h-3.5 w-3.5" />
          Reel
        </span>
        <span>
          {count('liked')} liked · {count('saved')} favorited · {count('passed')} passed
        </span>
        <span className="ml-auto">{remaining} left</span>
        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo last swipe (Z)"
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-border px-3 text-xs font-medium text-foreground transition-colors hover:bg-foreground/5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Rewind
        </button>
      </div>

      {/* The strip: a dark film band with sprocket rows top and bottom. */}
      <div className="relative rounded-md bg-black py-3">
        <Sprockets className="top-0.5" />
        <Sprockets className="bottom-0.5" />
        <ol className="no-scrollbar flex gap-2 overflow-x-auto px-3">
          {visible.length === 0 && (
            <li className="flex h-28 w-full items-center justify-center text-xs text-white/60">
              Swiped cards land here
            </li>
          )}
          <AnimatePresence initial={false}>
            {visible.map((frame, i) => {
              const v = VERDICT[frame.verdict];
              const pullable = i === 0 && canUndo;
              return (
                <motion.li
                  key={frame.key}
                  layout={!reduceMotion}
                  initial={reduceMotion ? { opacity: 0 } : { y: -60, opacity: 0, scale: 1.3 }}
                  animate={{ y: 0, opacity: 1, scale: 1 }}
                  exit={reduceMotion ? { opacity: 0 } : { y: -80, opacity: 0, scale: 1.2 }}
                  transition={{ type: 'spring', stiffness: 320, damping: 28 }}
                  // The newest frame can be pulled back up into the deck.
                  drag={pullable ? 'y' : false}
                  dragConstraints={{ top: 0, bottom: 0 }}
                  dragElastic={{ top: 0.6, bottom: 0 }}
                  onDragEnd={(_, info) => {
                    if (info.offset.y < -PULL_TO_UNDO_PX) onUndo();
                  }}
                  className={cn(
                    'flex w-16 shrink-0 flex-col items-center gap-1',
                    pullable && 'cursor-grab active:cursor-grabbing touch-none',
                  )}
                >
                  <ReelFrameButton frame={frame} onOpen={() => onOpen(frame.item)} />
                  <span className={cn('inline-flex items-center gap-0.5 text-[11px] font-semibold', v.tone)}>
                    <v.icon className="h-3 w-3" strokeWidth={3} />
                    {v.label}
                  </span>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ol>
      </div>

      {newest && (
        <p className="mt-2 truncate text-center text-xs text-muted-foreground">
          Last: <span className="text-foreground">{newest.item.title}</span>
          {canUndo && ' · pull it up, press Z or Rewind to undo'}
        </p>
      )}
    </section>
  );
}

/** Poster frame tinted by verdict: pass dimmed, like outlined, favorite lit. */
function ReelFrameButton({ frame, onOpen }: { frame: ReelFrame; onOpen: () => void }) {
  const poster = buildImageUrl(frame.item.posterPath, 'w154');
  const { label } = VERDICT[frame.verdict];
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${label}: ${frame.item.title}. Open quick view`}
      title={frame.item.title}
      className={cn(
        'relative h-24 w-16 overflow-hidden rounded-sm bg-muted cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        frame.verdict !== 'passed' && 'ring-2 ring-primary',
      )}
    >
      {poster && (
        <Image
          src={poster}
          alt=""
          fill
          draggable={false}
          sizes="64px"
          className={cn(
            'object-cover pointer-events-none',
            frame.verdict === 'passed' && 'grayscale opacity-40',
          )}
        />
      )}
      {frame.verdict === 'saved' && (
        <span className="absolute inset-x-0 bottom-0 flex justify-center bg-primary py-0.5 text-primary-foreground">
          <Heart className="h-3 w-3 fill-current" />
        </span>
      )}
      {frame.verdict === 'passed' && (
        <span className="absolute inset-0 flex items-center justify-center">
          <X className="h-5 w-5 text-white/70" strokeWidth={3} />
        </span>
      )}
    </button>
  );
}

function Sprockets({ className }: { className: string }) {
  return (
    <div aria-hidden className={cn('absolute inset-x-2 flex justify-between', className)}>
      {Array.from({ length: 18 }).map((_, i) => (
        <span key={i} className="h-1.5 w-2.5 rounded-[1px] bg-white/25" />
      ))}
    </div>
  );
}
