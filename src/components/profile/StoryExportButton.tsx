'use client';

import { useEffect, useState } from 'react';
import { Download, Eye, ImageDown, Share } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/button';
import { SkeletonBox } from '@/components/watchly/skeletons';
import { useToast } from '@/hooks/useToast';
import { trackProfile } from '@/client/profileEvents';
import { AccentScope } from '@/components/profile/AccentScope';
import type { AccentColor } from '@/constants/accentColors';

const STORY_ENDPOINT = '/api/me/profile/story';

type Story = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; blob: Blob; url: string };

/** What the story shows: the member card ("card") or the last-watched ticket ("ticket"). */
export type StoryKind = 'card' | 'ticket';

/**
 * Owner-only "Export" (icon): renders the profile, or the last-watched
 * ticket, as a 9:16 Instagram story server-side, previews it in a modal, then
 * downloads it — or, where the browser can share files (most phones), hands
 * it straight to the share sheet so it can go to an Instagram story in one tap.
 */
export function StoryExportButton({
  userId,
  username,
  accent,
  className,
  kind = 'card',
  label,
}: {
  userId: string;
  username: string;
  accent: AccentColor | null;
  className: string;
  kind?: StoryKind;
  /** Visible text beside the icon; icon-only when omitted. */
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => setOpen(true)}
        aria-label={kind === 'ticket' ? 'Export this ticket as an Instagram story' : 'Export as Instagram story'}
        title="Export as story"
      >
        <ImageDown className="h-4 w-4" />
        {label}
      </button>
      <Modal isOpen={open} onClose={() => setOpen(false)} className="max-w-sm border border-border bg-card">
        {/* Portaled to <body>, outside the page's AccentScope — re-apply the
            owner's accent. Mounted only while open: each open is a fresh render. */}
        <AccentScope accentColor={accent}>{open && <StoryPreview userId={userId} username={username} kind={kind} />}</AccentScope>
      </Modal>
    </>
  );
}

function StoryPreview({ userId, username, kind }: { userId: string; username: string; kind: StoryKind }) {
  const toast = useToast();
  const [story, setStory] = useState<Story>({ kind: 'loading' });
  const [nonce, setNonce] = useState(0);
  const fileName = `watchly-${username}-${kind === 'ticket' ? 'ticket' : 'story'}.png`;
  // The ticket's times are printed in the owner's timezone, which only the browser knows.
  const endpoint =
    kind === 'ticket' ? `${STORY_ENDPOINT}?kind=ticket&tz=${encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone)}` : STORY_ENDPOINT;

  useEffect(() => {
    let url: string | null = null;
    const controller = new AbortController();
    fetch(endpoint, { signal: controller.signal, cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error('render failed');
        const blob = await res.blob();
        url = URL.createObjectURL(blob);
        setStory({ kind: 'ready', blob, url });
      })
      .catch(() => {
        if (!controller.signal.aborted) setStory({ kind: 'error' });
      });
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [nonce, endpoint]);

  const file = story.kind === 'ready' ? new File([story.blob], fileName, { type: 'image/png' }) : null;
  const canShareFile = typeof navigator !== 'undefined' && !!file && !!navigator.canShare?.({ files: [file] });

  const download = () => {
    if (story.kind !== 'ready') return;
    const a = document.createElement('a');
    a.href = story.url;
    a.download = fileName;
    a.click();
    trackProfile(userId, 'share', undefined, { channel: 'story_download', story: kind });
  };

  const shareFile = async () => {
    if (!file) return;
    try {
      await navigator.share({ files: [file], title: kind === 'ticket' ? 'My last Watchly ticket' : 'My Watchly card' });
      trackProfile(userId, 'share', undefined, { channel: 'story_share', story: kind });
    } catch (err) {
      // AbortError = the user closed the share sheet; anything else, fall back.
      if ((err as Error).name !== 'AbortError') toast.error("Couldn't open sharing", 'Use Download instead.');
    }
  };

  return (
    <div className="flex flex-col">
      <header className="px-5 pt-5 pr-12">
        <h2 className="text-lg font-semibold leading-tight">{kind === 'ticket' ? 'Share your ticket' : 'Share your card'}</h2>
        <p className="mt-1 text-sm text-muted-foreground">Sized for an Instagram story.</p>
      </header>

      {/* The "stage": the story sits on a soft accent glow so the dark
          artwork reads as an object, not a hole in the modal. */}
      <div className="relative mx-5 mt-4 flex justify-center overflow-hidden rounded-xl border border-border bg-background px-6 py-5">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-radial from-primary/20 via-transparent to-transparent" />
        <div className="relative w-full max-w-52 overflow-hidden rounded-lg ring-1 ring-white/10 shadow-2xl shadow-black/60">
        {story.kind === 'ready' ? (
          // eslint-disable-next-line @next/next/no-img-element -- local blob URL, not optimizable
          <img src={story.url} alt="Preview of your Watchly story" className="block aspect-9/16 w-full" />
        ) : story.kind === 'loading' ? (
          <SkeletonBox className="aspect-9/16 w-full rounded-none" />
        ) : (
          <div className="flex aspect-9/16 flex-col items-center justify-center gap-3 p-6 text-center">
            <p className="text-sm text-muted-foreground">Couldn&apos;t create your story.</p>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setStory({ kind: 'loading' });
                setNonce((n) => n + 1);
              }}
            >
              Try again
            </Button>
          </div>
        )}
        </div>
      </div>

      <p className="mx-5 mt-3 flex items-start gap-2 text-xs text-muted-foreground">
        <Eye className="mt-px h-3.5 w-3.5 shrink-0" />
        {kind === 'ticket'
          ? 'Includes the times you started and logged it, and a QR code to your profile.'
          : 'Includes your Watchly Swipe stats, which are normally only visible to you.'}
      </p>

      <div className="mt-4 flex gap-2 border-t border-border p-4">
        {canShareFile && (
          <Button variant="secondary" className="flex-1 gap-2" onClick={() => void shareFile()}>
            <Share className="h-4 w-4" /> Share
          </Button>
        )}
        <Button className="flex-1 gap-2" onClick={download} disabled={story.kind !== 'ready'}>
          <Download className="h-4 w-4" /> Download
        </Button>
      </div>
    </div>
  );
}
