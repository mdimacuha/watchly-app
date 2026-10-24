'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion, useReducedMotion, type TargetAndTransition, type Transition } from 'framer-motion';
import { cn } from '@/lib/cn';
import { anton } from '@/lib/fonts';
import { trackProfile } from '@/client/profileEvents';
import { StoryExportButton } from '@/components/profile/StoryExportButton';
import type { AccentColor } from '@/constants/accentColors';
import type { LastWatchedTicket } from '@/services/watched/lastWatched';
import { ticketCopy, type TicketCopy } from './ticketCopy';
import { TicketReceipt } from './TicketReceipt';

/**
 * The member card with the last-watched ticket stacked underneath ("Box-
 * office slot"). Both share one grid cell, so the stack is as tall as the
 * taller of the two and nothing below it moves. The ticket peeks out of the
 * card's bottom-right corner (the bottom on phones) like a ticket from a
 * printer; hover or focus prints it out a little more. Click / Enter / Space
 * swaps: the card tips back on its top edge while the ticket prints out and
 * stands upright in front. The card then peeks from behind; clicking it (or
 * Esc) swaps back. The swap lasts this visit only.
 */

type Layer = 'card' | 'ticket';

interface Pose {
  x: number;
  y: number;
  rotate: number;
  rotateX: number;
  scale: number;
}

const FRONT: Pose = { x: 0, y: 0, rotate: 0, rotateX: 0, scale: 1 };
const DURATION = 0.52;
const MID = 0.5;

/** Where the layer behind rests, and how far hover prints it out. */
function backPose(md: boolean, hover: boolean): Pose {
  if (!md) return { ...FRONT, y: hover ? 46 : 36, scale: 0.98 };
  return { ...FRONT, x: hover ? 42 : 32, y: hover ? 44 : 32, rotate: hover ? 3 : 2, scale: 0.985 };
}

/**
 * The swap: the one coming forward prints further out, then stands upright;
 * the card tips back on its top edge. Each keyframe run starts from `null`
 * (wherever the layer is right now, e.g. mid-hover), so nothing snaps.
 */
function swapFrames(toFront: boolean, back: Pose): TargetAndTransition {
  return toFront
    ? { x: [null, back.x + 28, 0], y: [null, back.y + 120, 0], rotate: [null, 6, 0], rotateX: [null, 0, 0], scale: [null, 1, 1] }
    : { x: [null, 0, back.x], y: [null, -6, back.y], rotate: [null, 0, back.rotate], rotateX: [null, 14, 0], scale: [null, 0.98, back.scale] };
}

function useMd(): boolean {
  const [md, setMd] = useState(true);
  useEffect(() => {
    const q = window.matchMedia('(min-width: 768px)');
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMd(q.matches);
    const on = () => setMd(q.matches);
    q.addEventListener('change', on);
    return () => q.removeEventListener('change', on);
  }, []);
  return md;
}

interface TicketStackProps {
  ticket: LastWatchedTicket;
  owner: boolean;
  /** Profile owner's id, for events. */
  profileUserId: string;
  username: string;
  accent: AccentColor | null;
  /** The member card; `still` turns its tilt off while it's behind. */
  card: (still: boolean) => ReactNode;
}

export function TicketStack({ ticket, owner, profileUserId, username, accent, card }: TicketStackProps) {
  const reduce = useReducedMotion();
  const md = useMd();
  const [front, setFront] = useState<Layer>('card');
  // Which layer is drawn on top; flips halfway so the ticket visibly passes the card.
  const [top, setTop] = useState<Layer>('card');
  const [hover, setHover] = useState(false);
  // The swap's keyframes, fixed for its whole run: hover, re-renders and
  // extra clicks can't restart it halfway (that was the glitch).
  const [frames, setFrames] = useState<Record<Layer, TargetAndTransition> | null>(null);
  const timers = useRef<number[]>([]);
  const [copy, setCopy] = useState<TicketCopy | null>(null);
  const toggles = useRef<Record<Layer, HTMLButtonElement | null>>({ card: null, ticket: null });
  const key = `${ticket.mediaType}:${ticket.tmdbId}`;

  // Times are formatted in the viewer's local time, so only after mount
  // (the ticket starts behind the card, so the late text never flashes).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCopy(ticketCopy(ticket, owner));
  }, [ticket, owner]);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);
  const later = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, ms));

  function swap() {
    if (frames) return; // one swap at a time
    const next: Layer = front === 'card' ? 'ticket' : 'card';
    const behind: Layer = next === 'card' ? 'ticket' : 'card';
    trackProfile(profileUserId, 'ticket_swapped', key, { to: next });
    setFront(next);
    setHover(false);
    if (reduce) {
      setTop(next);
      toggles.current[behind]?.focus({ preventScroll: true });
      return;
    }
    const rest = backPose(md, false);
    setFrames({ [next]: swapFrames(true, rest), [behind]: swapFrames(false, rest) } as Record<Layer, TargetAndTransition>);
    later(() => setTop(next), DURATION * MID * 1000);
    // One timer ends the swap for both layers together, then focus follows
    // the toggle, which is now on the other layer.
    later(() => {
      setFrames(null);
      toggles.current[behind]?.focus({ preventScroll: true });
    }, DURATION * 1000 + 40);
  }

  useEffect(() => {
    if (front !== 'ticket') return;
    const onKey = (e: KeyboardEvent) => {
      // Esc in an open dialog (the story export) belongs to the dialog.
      if (e.key !== 'Escape' || e.defaultPrevented || document.querySelector('[role="dialog"]')) return;
      swap();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const back = backPose(md, hover);

  return (
    <div className={cn(anton.variable, 'relative grid', md ? 'pb-12 pr-14' : 'pb-12')} style={{ perspective: 1400 }}>
      {(['card', 'ticket'] as const).map((layer) => {
        const isFront = front === layer;
        const pose = isFront ? FRONT : back;
        const animate: TargetAndTransition = frames ? frames[layer] : { ...pose };
        const transition: Transition = reduce
          ? { duration: 0 }
          : frames
            ? { duration: DURATION, times: [0, MID, 1], ease: [0.2, 0.8, 0.2, 1] }
            : { type: 'spring', stiffness: 300, damping: 26 };
        return (
          <motion.div
            key={layer}
            className="relative [grid-area:1/1]"
            style={{ zIndex: top === layer ? 2 : 1, transformOrigin: layer === 'card' ? '50% 0%' : '50% 50%' }}
            initial={false}
            animate={animate}
            transition={transition}
          >
            <div inert={!isFront} className={cn('h-full transition-[filter] duration-300', !isFront && 'brightness-[0.75] saturate-[0.85]')}>
              {layer === 'card' ? (
                card(!isFront)
              ) : (
                <TicketReceipt
                  t={ticket}
                  copy={copy}
                  onOpen={() => trackProfile(profileUserId, 'title_opened', key, { section: 'last_watched_ticket' })}
                  action={
                    owner && (
                      <StoryExportButton
                        kind="ticket"
                        label="Share"
                        userId={profileUserId}
                        username={username}
                        accent={accent}
                        className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-background/60 px-3 text-sm font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      />
                    )
                  }
                />
              )}
            </div>
            {!isFront && (
              <button
                ref={(el) => {
                  toggles.current[layer] = el;
                }}
                type="button"
                onClick={swap}
                onPointerEnter={(e) => !frames && e.pointerType === 'mouse' && setHover(true)}
                onPointerLeave={() => setHover(false)}
                onFocus={() => !frames && setHover(true)}
                onBlur={() => setHover(false)}
                aria-label={layer === 'ticket' ? `Show last watched: ${ticket.title}` : 'Show the profile card'}
                className="absolute inset-0 z-10 cursor-pointer rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              />
            )}
          </motion.div>
        );
      })}
    </div>
  );
}
