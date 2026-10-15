'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, X } from 'lucide-react';
import { cn } from '@/lib/cn';

interface SidebarAnnouncementCardProps {
  /** Bold headline for the announcement. */
  title: string;
  /** Short supporting line under the title. */
  description: string;
  /** Optional thumbnail shown to the left of the copy. */
  imageSrc?: string;
  /** CTA label — only rendered when paired with `ctaHref`. */
  ctaLabel?: string;
  /** CTA destination — only rendered when paired with `ctaLabel`. */
  ctaHref?: string;
  /** Show the dismiss (X) affordance. Defaults to true. */
  dismissible?: boolean;
  /**
   * localStorage key used to persist a dismissal. Required for the dismiss
   * to *stick* across reloads — without it the X only hides for the session.
   */
  storageKey?: string;
  /** Fired when the CTA is clicked (e.g. to close a mobile nav overlay). */
  onCtaClick?: () => void;
  /** Extra classes — used to force dark-safe surfaces inside the sidebar. */
  className?: string;
}

/**
 * Compact, reusable "feature announcement" card for the sidebar (and other
 * narrow surfaces). Optional thumbnail + title + description + CTA, plus an
 * optional dismiss that persists via localStorage.
 *
 * Dismiss is hydration-safe: the persisted flag can only be read client-side,
 * so we render nothing until mounted, read localStorage in a mount effect, and
 * only then reveal the card. This mirrors the VerificationBanner pattern and
 * avoids a server/client markup mismatch.
 */
export function SidebarAnnouncementCard({
  title,
  description,
  imageSrc,
  ctaLabel,
  ctaHref,
  dismissible = true,
  storageKey,
  onCtaClick,
  className,
}: SidebarAnnouncementCardProps) {
  const [mounted, setMounted] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (dismissible && storageKey && typeof window !== 'undefined') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDismissed(window.localStorage.getItem(storageKey) === '1');
    }
     
    setMounted(true);
  }, [dismissible, storageKey]);

  // Hold the card back until we've read the persisted dismiss state so it
  // never flashes in before we know it was dismissed.
  if (!mounted || dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    if (storageKey && typeof window !== 'undefined') {
      window.localStorage.setItem(storageKey, '1');
    }
  };

  const showCta = Boolean(ctaLabel && ctaHref);

  return (
    <div
      className={cn(
        'relative rounded-xl border border-border bg-card p-3 text-foreground shadow-elevation-card',
        className,
      )}
    >
      {dismissible && (
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss announcement"
          className="absolute right-1.5 top-1.5 rounded-md p-1 text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X size={14} />
        </button>
      )}

      <div className="flex items-start gap-3">
        {imageSrc && (
          <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg">
            <Image
              src={imageSrc}
              alt=""
              fill
              sizes="40px"
              className="object-cover"
            />
          </div>
        )}
        <div className="min-w-0 flex-1 pr-5">
          <p className="text-sm font-semibold leading-snug text-foreground">
            {title}
          </p>
          <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
            {description}
          </p>
        </div>
      </div>

      {showCta && (
        <Link
          href={ctaHref!}
          onClick={onCtaClick}
          className="mt-3 inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {ctaLabel}
          <ArrowRight size={14} aria-hidden />
        </Link>
      )}
    </div>
  );
}
