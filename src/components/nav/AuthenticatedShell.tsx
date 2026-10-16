'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import Image from 'next/image';
import Link from 'next/link';
import { useUIStore } from '@/client/stores/ui';
import {
  AppSidebar,
  SIDEBAR_WIDTH_EXPANDED,
  SIDEBAR_WIDTH_COLLAPSED,
} from './AppSidebar';
import { TopBarBack } from './TopBarBack';
import { ToastProvider } from '@/components/toast/ToastProvider';
import { VerificationBanner } from '@/components/auth/VerificationBanner';
import { QuickViewModal } from '@/components/watchly/QuickViewModal';
import { MigrationModal } from '@/components/migration/MigrationModal';
import { PATHS } from '@/lib/app';

// ---------------------------------------------------------------------------
// Routes that hide the sidebar and show the back-button top bar instead.
// ---------------------------------------------------------------------------
const focusedRoutes: string[] = [];

function isFocusedRoute(pathname: string) {
  return focusedRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

const sidebarSpring = { type: 'spring' as const, stiffness: 300, damping: 30 };

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AuthenticatedShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const {
    isSidebarExpanded,
    isMobileOverlayOpen,
    expandSidebar,
    collapseSidebar,
    closeMobileOverlay,
  } = useUIStore();

  const focused = isFocusedRoute(pathname);

  // Desktop: start expanded. Mobile: start collapsed.
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    if (mq.matches) {
      expandSidebar();
    } else {
      collapseSidebar();
    }

    const handler = (e: MediaQueryListEvent) => {
      if (e.matches) expandSidebar();
      else collapseSidebar();
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ----- Focused mode (no sidebar, back-button top bar) -----
  if (focused) {
    return (
      <div className="min-h-screen bg-background">
        <TopBarBack />
        <main>{children}</main>
        <ToastProvider />
      </div>
    );
  }

  const sidebarWidth = isSidebarExpanded
    ? SIDEBAR_WIDTH_EXPANDED
    : SIDEBAR_WIDTH_COLLAPSED;

  // ----- Sidebar mode (default) -----
  return (
    <div className="min-h-screen bg-background">
      {/* ===== Desktop sidebar (always in DOM, animates width) ===== */}
      <div className="hidden md:block fixed inset-y-0 left-0 z-50">
        <AppSidebar collapsed={!isSidebarExpanded} />
      </div>

      {/* Desktop main content - margin animates with sidebar */}
      <motion.div
        className="hidden md:flex flex-col min-h-screen"
        animate={{ marginLeft: sidebarWidth }}
        transition={sidebarSpring}
      >
        <VerificationBanner />
        <main className="flex-1">{children}</main>
      </motion.div>

      {/* ===== Mobile layout =====
           Mobile gets a centred top bar + a full-viewport nav screen
           when opened — no slide-in panel, no collapsible state. The
           menu button on the left flips the nav open; the nav's own
           close (X) button (rendered by AppSidebar in fullPage mode)
           flips it shut. */}
      {/* overflow-x-clip: a too-wide child must never widen the page on
          phones — that stretches the layout viewport and drags fixed popups
          (Quick View, modals) off-screen. clip (not hidden) keeps sticky. */}
      <div className="md:hidden min-h-screen flex flex-col overflow-x-clip">
        <div className="relative flex items-center justify-center h-14 px-4 border-b border-border/50 shrink-0">
          <button
            type="button"
            onClick={() => useUIStore.getState().openMobileOverlay()}
            className="absolute left-3 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors cursor-pointer"
            aria-label="Open menu"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <Link
            href={PATHS.BASE_URL}
            className="flex items-center"
            aria-label="Watchly home"
          >
            <Image
              src="/brand-light.svg"
              alt="Watchly"
              width={28}
              height={28}
              className="w-auto h-auto"
              priority
            />
          </Link>
        </div>

        <VerificationBanner />
        <main className="flex-1">{children}</main>

        {/* Full-page mobile nav. Fades + slides up so the transition
            feels like a modal screen, not a sliver tray. */}
        <AnimatePresence>
          {isMobileOverlayOpen && (
            <motion.div
              key="mobile-nav"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="fixed inset-0 z-50"
            >
              <AppSidebar
                collapsed={false}
                fullPage
                onClose={closeMobileOverlay}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <ToastProvider />

      {/* Single global Quick View popup — mounted once here (outside both the
          desktop + mobile layout branches) so it never double-renders. */}
      <QuickViewModal />

      {/* Post-login "we've moved to app.gowatchly.com" popup. Self-gates by
          hostname + cookie/session, so it renders nothing on most loads. */}
      <MigrationModal />
    </div>
  );
}
