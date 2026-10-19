'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { ChevronDown, ChevronLeft, ChevronRight, Play, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { buildImageUrl } from '@/lib/tmdb';
import { ArrowStrip } from '@/components/ui/ArrowStrip';
import type { TmdbVideo } from '@/server/tmdb/types';
import type { TitleExtras, TitleImage } from '@/services/tmdb/title';

const STORAGE_KEY = 'watchly:title-media-open';

// Videos then stills (backdrops, posters). Open by default; the caret
// collapses it and the choice is remembered per browser.
export function MediaSection({
  media,
  onPlayVideo,
}: {
  media: TitleExtras['media'];
  onPlayVideo: (video: TmdbVideo) => void;
}) {
  const [open, setOpen] = useState(true);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const images = [...media.backdrops, ...media.posters];

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- per-browser preference
      if (localStorage.getItem(STORAGE_KEY) === 'closed') setOpen(false);
    } catch {}
  }, []);

  const toggle = () => {
    setOpen((o) => {
      try {
        localStorage.setItem(STORAGE_KEY, o ? 'closed' : 'open');
      } catch {}
      return !o;
    });
  };

  if (media.videos.length === 0 && images.length === 0) return null;

  const counts = [
    media.videos.length && `${media.videos.length} video${media.videos.length > 1 ? 's' : ''}`,
    images.length && `${images.length} image${images.length > 1 ? 's' : ''}`,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <section aria-labelledby="media-heading" className="flex flex-col gap-4">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls="media-body"
        className="group flex items-center gap-2 self-start rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <h2 id="media-heading" className="text-lg font-bold tracking-tight text-foreground">Media</h2>
        <ChevronDown
          className={cn('w-5 h-5 text-muted-foreground transition-transform group-hover:text-foreground', open && 'rotate-180')}
        />
        <span className="text-xs text-muted-foreground">{counts}</span>
      </button>

      {open && (
        <div id="media-body" className="flex flex-col gap-5">
          {media.videos.length > 0 && (
            <Strip label="Videos">
              {media.videos.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => onPlayVideo(v)}
                  className="group w-[260px] shrink-0 flex flex-col gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                >
                  <span className="relative aspect-video w-full overflow-hidden rounded-sm border border-border bg-card">
                    <Image
                      src={`https://i.ytimg.com/vi/${v.key}/mqdefault.jpg`}
                      alt=""
                      fill
                      sizes="260px"
                      className="object-cover transition-opacity group-hover:opacity-80"
                    />
                    <span className="absolute inset-0 flex items-center justify-center">
                      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-background/85 text-foreground">
                        <Play className="w-4 h-4 fill-current" />
                      </span>
                    </span>
                  </span>
                  <span className="text-sm font-semibold text-foreground leading-tight line-clamp-2">{v.name}</span>
                  <span className="-mt-1.5 type-kicker text-muted-foreground">{v.type}</span>
                </button>
              ))}
            </Strip>
          )}

          {images.length > 0 && (
            <Strip label="Stills & posters">
              {images.map((img, i) => (
                <button
                  key={img.filePath}
                  type="button"
                  onClick={() => setLightbox(i)}
                  aria-label={`Open image ${i + 1} of ${images.length}`}
                  className={cn(
                    'relative shrink-0 overflow-hidden rounded-sm border border-border bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    img.width >= img.height ? 'h-[146px] aspect-video' : 'h-[146px] aspect-2/3',
                  )}
                >
                  <Image
                    src={buildImageUrl(img.filePath, 'w500')!}
                    alt=""
                    fill
                    sizes="260px"
                    className="object-cover transition-opacity hover:opacity-80"
                  />
                </button>
              ))}
            </Strip>
          )}
        </div>
      )}

      {lightbox !== null && (
        <Lightbox images={images} index={lightbox} onIndex={setLightbox} onClose={() => setLightbox(null)} />
      )}
    </section>
  );
}

function Strip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5">
      <p className="type-kicker text-muted-foreground">{label}</p>
      <ArrowStrip label={label.toLowerCase()}>
        <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">{children}</div>
      </ArrowStrip>
    </div>
  );
}

function Lightbox({
  images,
  index,
  onIndex,
  onClose,
}: {
  images: TitleImage[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const step = useCallback(
    (d: number) => onIndex((index + d + images.length) % images.length),
    [index, images.length, onIndex],
  );

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') step(1);
      if (e.key === 'ArrowLeft') step(-1);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, step]);

  const img = images[index];
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Image ${index + 1} of ${images.length}`}
      className="fixed inset-0 z-80 flex items-center justify-center bg-background/95 p-4 md:p-12"
      onClick={onClose}
    >
      <div className="relative h-full w-full" onClick={(e) => e.stopPropagation()}>
        <Image src={buildImageUrl(img.filePath, 'w1280')!} alt="" fill sizes="100vw" className="object-contain" />
      </div>
      <button ref={closeRef} onClick={onClose} aria-label="Close" className="absolute top-4 right-4 rounded-md bg-card p-2 text-foreground border border-border">
        <X className="w-5 h-5" />
      </button>
      {images.length > 1 && (
        <>
          <button onClick={(e) => { e.stopPropagation(); step(-1); }} aria-label="Previous image" className="absolute left-3 top-1/2 -translate-y-1/2 rounded-md bg-card p-2 text-foreground border border-border">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button onClick={(e) => { e.stopPropagation(); step(1); }} aria-label="Next image" className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md bg-card p-2 text-foreground border border-border">
            <ChevronRight className="w-5 h-5" />
          </button>
          <span className="absolute bottom-4 left-1/2 -translate-x-1/2 font-mono text-xs text-muted-foreground">
            {index + 1} / {images.length}
          </span>
        </>
      )}
    </div>
  );
}
