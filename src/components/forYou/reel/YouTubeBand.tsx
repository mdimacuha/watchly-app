'use client';

// YouTube IFrame Player API wrapper for the For You reel.
// Nothing of ours is ever drawn on top of the player (YouTube RMF); callers
// put every control outside this element.

import { useEffect, useRef } from 'react';

interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  mute(): void;
  unMute(): void;
  setVolume(v: number): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getPlayerState(): number;
  getCurrentTime(): number;
  getDuration(): number;
  destroy(): void;
}
interface YTNamespace {
  Player: new (el: HTMLElement, opts: unknown) => YTPlayer;
}
declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<YTNamespace> | null = null;
function loadApi(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  apiPromise ??= new Promise((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve(window.YT!);
    };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(s);
  });
  return apiPromise;
}

export const YT_STATE = { ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 } as const;

export function YouTubeBand({
  videoKey,
  mode,
  muted,
  start,
  captions,
  volume = 100,
  onState,
  onError,
  onProgress,
  onAutoplayBlocked,
}: {
  videoKey: string;
  /** play = visible and active; cue = mounted early, paused (next item). */
  mode: 'play' | 'cue';
  muted: boolean;
  /** Seconds to skip (e.g. studio logos). */
  start?: number;
  captions?: boolean;
  /** 0..100, applied whenever sound is on. */
  volume?: number;
  onState?: (state: number) => void;
  onError?: (code: number) => void;
  /** 0..1, polled while playing. */
  onProgress?: (fraction: number) => void;
  /** Sound-on autoplay was refused by the browser; the band fell back to muted. */
  onAutoplayBlocked?: () => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const readyRef = useRef(false);
  // Latest props for callbacks created once at player construction.
  const live = useRef({ mode, muted, volume, onState, onError, onProgress, onAutoplayBlocked });
  useEffect(() => {
    live.current = { mode, muted, volume, onState, onError, onProgress, onAutoplayBlocked };
  });

  useEffect(() => {
    let cancelled = false;
    const mount = document.createElement('div');
    hostRef.current?.appendChild(mount);
    loadApi().then((YT) => {
      if (cancelled) return;
      playerRef.current = new YT.Player(mount, {
        videoId: videoKey,
        width: '100%',
        height: '100%',
        playerVars: {
          controls: 0,
          playsinline: 1,
          mute: 1,
          rel: 0,
          iv_load_policy: 3,
          enablejsapi: 1,
          origin: window.location.origin,
          cc_load_policy: captions ? 1 : 0,
          ...(start ? { start } : {}),
        },
        events: {
          onReady: () => {
            readyRef.current = true;
            const p = playerRef.current!;
            p.setVolume(live.current.volume);
            if (live.current.muted) p.mute();
            else p.unMute();
            if (live.current.mode === 'play' && !live.current.muted) watchAutoplay(p, () => live.current.onAutoplayBlocked?.());
            if (live.current.mode === 'play') p.playVideo();
          },
          onStateChange: (e: { data: number }) => {
            // Loop ourselves: the playlist trick adds prev/next buttons.
            if (e.data === YT_STATE.ENDED) {
              playerRef.current?.seekTo(start ?? 0, true);
              playerRef.current?.playVideo();
            }
            live.current.onState?.(e.data);
          },
          onError: (e: { data: number }) => live.current.onError?.(e.data),
        },
      });
    });
    return () => {
      cancelled = true;
      readyRef.current = false;
      playerRef.current?.destroy();
      playerRef.current = null;
      mount.remove();
    };
  }, [videoKey, start, captions]);

  // Play / pause with the feed position.
  useEffect(() => {
    const p = playerRef.current;
    if (!p || !readyRef.current) return;
    if (mode !== 'play') {
      p.pauseVideo();
      return;
    }
    p.playVideo();
    if (!live.current.muted) return watchAutoplay(p, () => live.current.onAutoplayBlocked?.());
  }, [mode]);

  // Sound. If the browser refuses sound-on playback, fall back to muted.
  useEffect(() => {
    const p = playerRef.current;
    if (!p || !readyRef.current) return;
    if (muted) {
      p.mute();
      return;
    }
    p.setVolume(live.current.volume);
    p.unMute();
    if (live.current.mode !== 'play') return;
    p.playVideo();
    return watchAutoplay(p, () => live.current.onAutoplayBlocked?.());
  }, [muted]);

  // Volume changes while sound is on (unmuting applies it above).
  useEffect(() => {
    const p = playerRef.current;
    if (!p || !readyRef.current || live.current.muted) return;
    p.setVolume(volume);
  }, [volume]);

  // Progress polling (only when someone listens).
  useEffect(() => {
    if (mode !== 'play' || !onProgress) return;
    const id = setInterval(() => {
      const p = playerRef.current;
      if (!p || !readyRef.current) return;
      const d = p.getDuration();
      if (d > 0) live.current.onProgress?.(p.getCurrentTime() / d);
    }, 250);
    return () => clearInterval(id);
  }, [mode, onProgress]);

  // The player gets no pointer input, so YouTube never draws its hover
  // chrome (title, share, watch later). Play/pause and sound are our own
  // buttons outside the frame. Nothing is layered over the player.
  return <div ref={hostRef} className="pointer-events-none h-full w-full bg-black [&>iframe]:h-full [&>iframe]:w-full" />;
}

/** YouTube's mark for "via YouTube" credits, drawn on our frame, never on the player. */
export function YouTubeLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 20" className={className} aria-hidden>
      <path
        fill="#FF0033"
        d="M27.4 3.1A3.5 3.5 0 0 0 25 .6C22.8 0 14 0 14 0S5.2 0 3 .6A3.5 3.5 0 0 0 .6 3.1C0 5.3 0 10 0 10s0 4.7.6 6.9A3.5 3.5 0 0 0 3 19.4c2.2.6 11 .6 11 .6s8.8 0 11-.6a3.5 3.5 0 0 0 2.4-2.5c.6-2.2.6-6.9.6-6.9s0-4.7-.6-6.9Z"
      />
      <path fill="#fff" d="m11.2 14.3 7.3-4.3-7.3-4.3v8.6Z" />
    </svg>
  );
}

/**
 * Browsers may refuse sound-on playback without a recent tap. If the player
 * hasn't started 1.5s after asking, retry muted and report it. Returns a cancel.
 */
function watchAutoplay(p: YTPlayer, onBlocked: () => void): () => void {
  const t = setTimeout(() => {
    const s = p.getPlayerState();
    if (s !== YT_STATE.PLAYING && s !== YT_STATE.BUFFERING) {
      p.mute();
      p.playVideo();
      onBlocked();
    }
  }, 1500);
  return () => clearTimeout(t);
}
