'use client';

import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AnimatedAddressBar } from './AnimatedAddressBar';
import { MigrationBackdrop } from './MigrationBackdrop';
import {
  resolveVariant,
  MIGRATION_COPY,
  NEW_HOST,
  NEW_ORIGIN,
  hasMigratedCookie,
  setMigratedCookie,
  isNudgeDismissedThisSession,
  dismissNudgeForSession,
  type MigrationVariant,
} from '@/lib/migration';

/**
 * Post-login "we've moved" popup. Mounted once in AuthenticatedShell so it can
 * appear on any authed route after the login hard-nav.
 *
 * Behavior is hostname-driven (see @/lib/migration):
 *  • OLD domain → nudge: CTA hard-navigates to the new domain (preserving the
 *    path); dismiss is session-scoped so it returns next login.
 *  • NEW domain → welcome: CTA/dismiss set a permanent cookie so it shows once.
 *
 * The decision runs in a mount effect (needs window.location + cookies), so the
 * first render is always closed — no SSR/hydration mismatch.
 */
export function MigrationModal() {
  const [variant, setVariant] = useState<MigrationVariant | null>(null);
  const [open, setOpen] = useState(false);
  const [images, setImages] = useState<string[]>([]);

  // Decide whether to show, once on the client.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const v = resolveVariant(window.location.hostname, params.get('migration'));
    if (!v) return;
    if (v === 'welcome' && hasMigratedCookie()) return;
    if (v === 'nudge' && isNudgeDismissedThisSession()) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVariant(v);
    setOpen(true);
  }, []);

  // Lazily fetch decorative stills only when we're actually showing.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch('/api/v1/tmdb/backdrops')
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (cancelled || !json?.success || !Array.isArray(json.data)) return;
        setImages(json.data as string[]);
      })
      .catch(() => {
        // Gradient-only fallback — MigrationBackdrop handles an empty list.
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const handleDismiss = useCallback(() => {
    if (variant === 'welcome') setMigratedCookie();
    else if (variant === 'nudge') dismissNudgeForSession();
    setOpen(false);
  }, [variant]);

  const handlePrimary = useCallback(() => {
    if (variant === 'welcome') {
      setMigratedCookie();
      setOpen(false);
      return;
    }
    // Nudge → move to the new home, keeping the user on the same page.
    window.location.assign(
      NEW_ORIGIN + window.location.pathname + window.location.search,
    );
  }, [variant]);

  // Scroll-lock + Esc-to-dismiss while open (mirrors ui/Modal.tsx).
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleDismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [open, handleDismiss]);

  const copy = variant ? MIGRATION_COPY[variant] : null;

  return (
    <AnimatePresence>
      {open && copy && (
        <motion.div
          key="migration-modal"
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
        >
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            aria-hidden="true"
            onClick={handleDismiss}
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="migration-heading"
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
          >
            <MigrationBackdrop images={images} />

            <button
              type="button"
              onClick={handleDismiss}
              aria-label="Close"
              className="absolute right-3 top-3 z-10 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="relative flex flex-col items-center gap-7 px-8 py-14 text-center sm:px-14">
              <AnimatedAddressBar url={NEW_HOST} className="w-full max-w-sm" />

              <div className="space-y-3">
                <h2 id="migration-heading" className="text-h2 text-foreground">
                  {copy.heading}
                </h2>
                <p className="text-body-lg text-muted-foreground">
                  {copy.body}
                </p>
              </div>

              <div className="flex w-full flex-col gap-3 sm:max-w-sm">
                <Button
                  onClick={handlePrimary}
                  size="lg"
                  className="h-12 w-full text-base"
                >
                  {copy.primaryCta}
                </Button>
                {copy.secondaryCta && (
                  <Button
                    variant="ghost"
                    onClick={handleDismiss}
                    className="h-12 w-full text-base"
                  >
                    {copy.secondaryCta}
                  </Button>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
