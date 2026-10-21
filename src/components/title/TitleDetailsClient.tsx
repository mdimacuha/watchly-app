'use client';

import React, { useCallback, useState } from 'react';
import { TitlePagePayload } from '@/services/tmdb/title';
import type { TmdbVideo } from '@/server/tmdb/types';
import { BackLink } from '@/components/nav/BackLink';
import { TitlePageBody } from './TitlePageBody';

interface TitleDetailsClientProps {
  titleData: TitlePagePayload;
}

export function TitleDetailsClient({ titleData }: TitleDetailsClientProps) {
  // Any video (the trailer button or a Media tile) plays in the hero band,
  // which grows into a player at the top of the page — so scroll up to it.
  const [playing, setPlaying] = useState<TmdbVideo | null>(null);
  const play = useCallback((video: TmdbVideo | null) => {
    if (!video) return;
    setPlaying(video);
    window.scrollTo({
      top: 0,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
  }, []);
  const close = useCallback(() => setPlaying(null), []);

  return (
    <div className="relative flex flex-col min-h-screen">
      {/* Floating over the hero rather than sitting in a plain strip above it. */}
      <BackLink
        fallbackHref="/programme"
        className="absolute top-4 left-4 md:top-6 md:left-6 z-30 rounded-full bg-background/70 hover:bg-background/90 backdrop-blur-sm border border-border/60 px-3 py-1.5 shadow-sm"
      />

      <TitlePageBody
        titleData={titleData}
        onWatchTrailer={() => play(titleData.trailer)}
        onPlayVideo={play}
        playing={playing}
        onClosePlayer={close}
      />
    </div>
  );
}
