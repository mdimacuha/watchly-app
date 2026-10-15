'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  getUnreadNotificationCountAction,
  markAllNotificationsReadAction,
} from '@/actions/notifications';
import {
  Search,
  Sparkles,
  ArrowLeftRight,
  Bookmark,
  Heart,
  Settings,
  User,
  PanelLeftClose,
  PanelLeft,
  LogOut,
  X,
} from 'lucide-react';
import { Bell } from 'lucide-react';
import Link from 'next/link';
import { useUIStore } from '@/client/stores/ui';
import { useAuthStore } from '@/client/stores/auth';
import { useToast } from '@/hooks/useToast';
import { SidebarNavItem } from './SidebarNavItem';
import { SidebarAnnouncementCard } from './SidebarAnnouncementCard';
import { ExperimentalBadge } from '@/components/watchly/ExperimentalBadge';
import { RegionButton } from '@/components/region/RegionButton';
import { IconButton } from '@/components/ui/icon-button';
import { UserAvatar } from '@/components/ui/user-avatar';
import { ConfirmDestructiveModal } from '@/components/ui/ConfirmDestructiveModal';
import { cn } from '@/lib/cn';
import { PATHS, EXTERNAL_PATHS } from '@/lib/app';
import Image from 'next/image';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const SIDEBAR_WIDTH_EXPANDED = 280;
export const SIDEBAR_WIDTH_COLLAPSED = 68;

const sidebarSpring = { type: 'spring' as const, stiffness: 300, damping: 30 };

// ---------------------------------------------------------------------------
// Navigation config
// ---------------------------------------------------------------------------

const MENU_ITEMS = [
  { href: '/search', icon: Search, label: 'Search', experimental: false },
  { href: '/for-you', icon: Sparkles, label: 'For You', experimental: false },
  // Swipe is still being tuned (recommendation weights, gesture feel) —
  // flag it as experimental so users know what they're stepping into.
  { href: '/swipe', icon: ArrowLeftRight, label: 'Watchly Swipe', experimental: true },
  { href: '/watchlists', icon: Bookmark, label: 'Watchlists', experimental: false },
  { href: '/favorites', icon: Heart, label: 'Favorites', experimental: false },
] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface AppSidebarProps {
  /** Whether the sidebar is in collapsed icon-rail mode. */
  collapsed: boolean;
  /**
   * Renders as a full-viewport mobile nav: centred brand instead of
   * the collapse toggle, optional close button. The desktop rail
   * never sets this.
   */
  fullPage?: boolean;
  /** Called by the close button when fullPage is true. */
  onClose?: () => void;
}

export function AppSidebar({
  collapsed,
  fullPage = false,
  onClose,
}: AppSidebarProps) {
  const pathname = usePathname();
  const toast = useToast();
  const { toggleSidebar, closeMobileOverlay } = useUIStore();
  const user = useAuthStore(s => s.user);
  const clearAuth = useAuthStore((s) => s.clear);
  const [signingOut, setSigningOut] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      const res = await fetch('/api/v1/auth/signout', { method: 'POST' });
      if (!res.ok) throw new Error('Sign out failed');
      clearAuth();
      // Hard redirect so the (authed) + (public) layouts re-run with no
      // session cookie. router.push would keep the SPA shell + stale
      // server data around.
      window.location.assign('/signin');
    } catch {
      setSigningOut(false);
      toast.error('Sign out failed', 'Could not sign you out. Please try again.');
    }
  };

  // Unread activity badge — refetched on route change (so mark-all-read
  // clears the dot immediately) and on a 60s poll while the tab is visible.
  // Polling pauses when the tab is hidden to avoid burning queries.
  const [unreadCount, setUnreadCount] = useState(0);
  // Mirror the count in a ref so the bell handler can read the latest value
  // without re-creating its callback, and gate a mark-read that's mid-flight
  // so a concurrent refetch doesn't clobber the optimistic zero.
  const unreadRef = useRef(0);
  const markingReadRef = useRef(false);
  const applyUnread = useCallback((n: number) => {
    unreadRef.current = n;
    setUnreadCount(n);
  }, []);

  // Opening the bell marks everything read: zero the badge immediately, then
  // persist. While the write is settling we suppress background refreshes so a
  // stale (pre-commit) count can't flash the badge back. The `unreadRef === 0`
  // / `markingReadRef` guards make repeated opens no-ops (no duplicate writes).
  const markNotificationsRead = useCallback(() => {
    if (unreadRef.current === 0 || markingReadRef.current) return;
    markingReadRef.current = true;
    applyUnread(0);
    markAllNotificationsReadAction()
      .then(() => getUnreadNotificationCountAction())
      .then((n) => applyUnread(n))
      .catch(() => {
        // Leave the optimistic zero in place; the next poll will re-sync.
      })
      .finally(() => {
        markingReadRef.current = false;
      });
  }, [applyUnread]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const refresh = () => {
      getUnreadNotificationCountAction()
        .then((n) => {
          // Don't overwrite the optimistic zero while a mark-read is in flight.
          if (!cancelled && !markingReadRef.current) applyUnread(n);
        })
        .catch(() => {
          if (!cancelled && !markingReadRef.current) applyUnread(0);
        });
    };

    const startPolling = () => {
      if (timer) return;
      timer = setInterval(refresh, 60_000);
    };
    const stopPolling = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refresh(); // catch up on what we missed while hidden
        startPolling();
      } else {
        stopPolling();
      }
    };

    refresh();
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      startPolling();
    }
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      cancelled = true;
      stopPolling();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
    // applyUnread is stable (useCallback with no deps); pathname drives the
    // refetch-on-navigation behaviour.
  }, [pathname, applyUnread]);

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  const handleMobileNav = () => {
    if (window.innerWidth < 768) closeMobileOverlay();
  };

  return (
    <motion.aside
      // Animated width is meaningless when the parent gives us the full
      // viewport — skip the spring entirely in fullPage mode.
      animate={
        fullPage
          ? undefined
          : {
              width: collapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED,
            }
      }
      transition={sidebarSpring}
      // Sidebar is intentionally always-dark even in light theme. Override
      // foreground/muted-foreground inside so descendant `text-foreground`
      // / `text-muted-foreground` utilities resolve to their dark-mode
      // values and stay readable on the dark bg. Sets both the base vars
      // and the `--color-*` aliases Tailwind v4 reads (mirrors the same
      // dual-write pattern AccentScope uses).
      style={{
        '--foreground': '#fafafa',
        '--muted-foreground': '#a1a1aa',
        '--color-foreground': '#fafafa',
        '--color-muted-foreground': '#a1a1aa',
      } as React.CSSProperties}
      className={cn(
        'h-full flex flex-col bg-[#0c0d14] overflow-hidden',
        fullPage ? 'w-full' : 'border-r border-white/5',
      )}
    >
      {/* ---- Brand ---- */}
      <div
        className={cn(
          'flex items-center shrink-0 px-4',
          fullPage ? 'h-16 justify-center relative' : 'h-16',
        )}
      >
        {fullPage ? (
          /* Mobile full-page: centred brand + close (X) button on the
             right. No collapse toggle — full-page mode has no expanded/
             collapsed states. */
          <>
            <Link
              href={PATHS.BASE_URL}
              className="flex items-center gap-2 group"
              onClick={onClose}
            >
              <Image
                src="/brand-light.svg"
                alt="Watchly Logo"
                width={32}
                height={32}
                className="w-auto h-auto mt-2"
                priority
              />
            </Link>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors cursor-pointer"
                aria-label="Close menu"
              >
                <X size={20} />
              </button>
            )}
          </>
        ) : collapsed ? (
          /* Collapsed: icon-only brand + expand button */
          <button
            type="button"
            onClick={toggleSidebar}
            className="mx-auto p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors cursor-pointer"
            aria-label="Expand sidebar"
          >
            <PanelLeft size={18} />
          </button>
        ) : (
          /* Expanded: brand + collapse button */
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-3">
              <Link
                href={PATHS.BASE_URL}
                className="flex items-center gap-2 group z-20"
              >
                <Image
                  src="/brand-light.svg"
                  alt="Watchly Logo"
                  width={32}
                  height={32}
                  className="w-auto h-auto mt-2"
                />
              </Link>
            </div>
            <button
              type="button"
              onClick={toggleSidebar}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors cursor-pointer"
              aria-label="Collapse sidebar"
            >
              <PanelLeftClose size={18} />
            </button>
          </div>
        )}
      </div>

      {/* ---- Menu section ---- */}
      <nav className="flex-1 overflow-y-auto px-2 pt-2">
        {!collapsed && (
          <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
            Menu
          </p>
        )}
        <div className="space-y-0.5">
          {MENU_ITEMS.map(item => (
            <SidebarNavItem
              key={item.href}
              href={item.href}
              icon={item.icon}
              label={item.label}
              isActive={isActive(item.href)}
              collapsed={collapsed}
              onClick={handleMobileNav}
              badge={
                item.experimental ? (
                  <ExperimentalBadge size="sm" label="Beta" />
                ) : undefined
              }
            />
          ))}
        </div>

        {!collapsed && (
          <p className="px-3 pt-6 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
            Profile
          </p>
        )}
        {collapsed && <div className="pt-4" />}
        <div className="space-y-0.5">
          {/* My Profile row with notification button */}
          <div className={collapsed ? 'space-y-0.5' : 'flex items-center'}>
            <div className="flex-1 min-w-0">
              <SidebarNavItem
                href="/me"
                icon={User}
                label="My Profile"
                isActive={isActive('/me')}
                collapsed={collapsed}
                avatar={
                  <UserAvatar
                    avatarUrl={user?.avatarUrl}
                    firstName={user?.firstName}
                    lastName={user?.lastName}
                    size="sm"
                  />
                }
                onClick={handleMobileNav}
              />
            </div>
            {!collapsed && (
              <Link
                href="/notifications"
                onClick={() => {
                  handleMobileNav();
                  markNotificationsRead();
                }}
              >
                <IconButton
                  icon={Bell}
                  count={unreadCount}
                  size="sm"
                  className="shrink-0 mr-1"
                  aria-label="Notifications"
                />
              </Link>
            )}
            {collapsed && (
              <div className="flex justify-center">
                <Link
                  href="/notifications"
                  onClick={() => {
                    handleMobileNav();
                    markNotificationsRead();
                  }}
                >
                  <IconButton
                    icon={Bell}
                    count={unreadCount}
                    size="sm"
                    aria-label="Notifications"
                  />
                </Link>
              </div>
            )}
          </div>

          {/* Settings */}
          <SidebarNavItem
            href="/settings"
            icon={Settings}
            label="Settings"
            isActive={isActive('/settings')}
            collapsed={collapsed}
            onClick={handleMobileNav}
          />

          {/* Sign out — pinned right under Settings since both are
              "account housekeeping" actions. Same row metrics as
              SidebarNavItem so it lines up visually with the items
              above it, but it's a <button> (not a Link) since it
              fires an action instead of navigating. */}
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={signingOut}
            title={collapsed ? 'Sign out' : undefined}
            className={cn(
              'flex items-center rounded-lg text-sm font-medium transition-colors cursor-pointer',
              'text-muted-foreground hover:text-foreground hover:bg-white/5',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              collapsed ? 'justify-center h-11 w-11 mx-auto' : 'gap-3 px-3 h-11 w-full',
            )}
            aria-label="Sign out"
          >
            <LogOut size={20} />
            {!collapsed && <span>Sign out</span>}
          </button>
        </div>
      </nav>

      {/* ---- Feature announcement (expanded / full-page only) ----
          Sits in a shrink-0 block just above the footer so the nav above
          keeps its own scroll (flex-1 overflow-y-auto) and this never
          pushes menu items off-screen. Hidden in the collapsed icon rail. */}
      {!collapsed && (
        <div className="shrink-0 px-3 pt-2">
          <SidebarAnnouncementCard
            title="Introducing Watchly Swipe"
            description="Swipe through picks tuned to your taste and build your watchlist in seconds."
            ctaLabel="Try it now"
            ctaHref={PATHS.SWIPE}
            storageKey="watchly_announce_swipe_v1"
            onCtaClick={handleMobileNav}
            // Sidebar is always-dark: override the theme-flipping card tokens
            // with white-alpha surfaces so it stays correct in light mode too.
            className="border-white/10 bg-white/[0.04] shadow-none"
          />
        </div>
      )}

      {/* ---- Region picker pinned to bottom ---- */}
      <div className={cn('shrink-0 pt-2', collapsed ? 'pb-4' : 'pb-2')}>
        <RegionButton collapsed={collapsed} />
      </div>

      {/* ---- Footer links (expanded / full-page only) ---- */}
      {!collapsed && (
        <nav
          aria-label="Footer"
          className="shrink-0 flex flex-wrap items-center gap-x-2.5 gap-y-1 px-4 pb-4 text-xs text-muted-foreground"
        >
          <Link
            href={EXTERNAL_PATHS.BUSINESS.TERMS_OF_SERVICE}
            onClick={handleMobileNav}
            className="hover:text-foreground transition-colors rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Terms
          </Link>
          <span aria-hidden className="opacity-40">
            ·
          </span>
          <Link
            href={PATHS.BUSINESS.PRIVACY_POLICY}
            onClick={handleMobileNav}
            className="hover:text-foreground transition-colors rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Privacy
          </Link>
          <span aria-hidden className="opacity-40">
            ·
          </span>
          <a
            href={PATHS.BUSINESS.CONTACT}
            className="hover:text-foreground transition-colors rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Feedback
          </a>
        </nav>
      )}

      <ConfirmDestructiveModal
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleSignOut}
        icon={LogOut}
        title="Sign out?"
        description="You'll need to sign in again to access your watchlists and recommendations."
        confirmLabel="Sign out"
        cancelLabel="Cancel"
      />
    </motion.aside>
  );
}
