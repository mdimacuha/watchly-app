'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Bell, LogOut, PanelLeft, PanelLeftClose, Pin, PinOff, Search, Settings, X } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { getUnreadNotificationCountAction } from '@/actions/notifications';
import { NOTIFICATIONS_READ_EVENT } from '@/client/notifications';
import { useUIStore } from '@/client/stores/ui';
import { useAuthStore } from '@/client/stores/auth';
import { useToast } from '@/hooks/useToast';
import { setSidebarPrefs, useSidebarPrefs } from '@/client/sidebarPrefs';
import { useChangelogPromo } from '@/components/changelog/ChangelogPromoProvider';
import { UserAvatar } from '@/components/ui/user-avatar';
import { ConfirmDestructiveModal } from '@/components/ui/ConfirmDestructiveModal';
import { cn } from '@/lib/cn';
import { PATHS, EXTERNAL_PATHS } from '@/lib/app';
import { SidebarAnnouncementCard } from './SidebarAnnouncementCard';
import { SidebarRegion } from './SidebarRegion';
import { SidebarSearch, useSearchShortcut } from './SidebarSearch';
import { SidebarTonight } from './SidebarTonight';
import { SidebarTree } from './SidebarTree';
import { DISCOVER, PROFILE, activeNavId, type NavNode } from './sidebarNav';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const SIDEBAR_WIDTH_EXPANDED = 280;
export const SIDEBAR_WIDTH_COLLAPSED = 68;
/** Floating: a slim rail, opening (over the page, unless pinned) to the full panel. */
export const SIDEBAR_FLOAT_RAIL = 64;
export const SIDEBAR_FLOAT_OPEN = 280;

const sidebarSpring = { type: 'spring' as const, stiffness: 300, damping: 30 };
// Floating with fluid motion: a softer, slightly springier settle.
const FLUID_SPRING = { type: 'spring' as const, stiffness: 260, damping: 28, mass: 0.9 };

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
  /**
   * The experimental floating sidebar (Settings › Sidebar): a rail off the
   * screen's edge that opens over the page on hover or focus, or stays open
   * when pinned. The collapsed prop doesn't apply to it.
   */
  floating?: { translucent: boolean; fluid: boolean } | null;
}

/**
 * Search on top; then the two trees (Discover: the ways to find something;
 * My Profile: what you've kept); then Tonight, a ticket answering "what
 * tonight?"; then where you are, Settings and sign out. Collapsed, it's an
 * icon rail with every destination its own icon.
 */
export function AppSidebar({
  collapsed,
  fullPage = false,
  onClose,
  floating = null,
}: AppSidebarProps) {
  const pathname = usePathname();
  const toast = useToast();
  const { toggleSidebar, closeMobileOverlay } = useUIStore();
  const user = useAuthStore(s => s.user);
  const clearAuth = useAuthStore((s) => s.clear);
  const [signingOut, setSigningOut] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const promo = useChangelogPromo();

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

  // Opening the bell zeroes the badge at once. The page itself marks rows read
  // once it has shown them (so it can still say what's new), then fires
  // NOTIFICATIONS_READ_EVENT; until then background refreshes are held back so
  // a pre-commit count can't flash the badge back.
  const markNotificationsRead = useCallback(() => {
    if (unreadRef.current === 0 || markingReadRef.current) return;
    markingReadRef.current = true;
    applyUnread(0);
    window.setTimeout(() => {
      markingReadRef.current = false;
    }, 8000);
  }, [applyUnread]);

  useEffect(() => {
    const onRead = () => {
      markingReadRef.current = false;
      getUnreadNotificationCountAction().then(applyUnread, () => {});
    };
    window.addEventListener(NOTIFICATIONS_READ_EVENT, onRead);
    return () => window.removeEventListener(NOTIFICATIONS_READ_EVENT, onRead);
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

  const prefs = useSidebarPrefs();
  const active = activeNavId(pathname);
  const onSettings = pathname.startsWith(PATHS.SETTINGS.ROOT);

  // Floating: open while pinned, or while the pointer or keyboard focus is
  // inside it. Brief delays so just passing over it does nothing.
  const [peek, setPeek] = useState(false);
  const peekTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const peekTo = (open: boolean, ms: number) => {
    if (peekTimer.current) clearTimeout(peekTimer.current);
    peekTimer.current = setTimeout(() => setPeek(open), ms);
  };
  useEffect(() => () => {
    if (peekTimer.current) clearTimeout(peekTimer.current);
  }, []);

  const floats = !!floating && !fullPage;
  const fluid = floats && floating.fluid;
  const pinned = prefs.pinned;
  const hoverable = floats && !pinned;
  const rail = fullPage ? false : floats ? !(pinned || peek) : collapsed;
  const width = fullPage
    ? undefined
    : floats
      ? rail ? SIDEBAR_FLOAT_RAIL : SIDEBAR_FLOAT_OPEN
      : collapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED;

  const handleMobileNav = () => {
    if (window.innerWidth < 768) closeMobileOverlay();
    // Floating folds back away once you've picked somewhere.
    if (hoverable) setPeek(false);
  };

  const avatar = (
    <UserAvatar avatarUrl={user?.avatarUrl} firstName={user?.firstName} lastName={user?.lastName} size="sm" />
  );

  const bell = (
    <Link
      href="/notifications"
      onClick={() => {
        handleMobileNav();
        markNotificationsRead();
      }}
      aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : 'Notifications'}
      title={rail ? 'Notifications' : undefined}
      className={cn(
        'relative flex shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        rail ? 'mx-auto h-10 w-10' : 'h-9 w-9',
      )}
    >
      <Bell size={18} aria-hidden />
      {unreadCount > 0 && (
        <span className="absolute right-1 top-1 min-w-4 rounded-full bg-primary px-1 text-center text-[10px] font-semibold leading-4 text-primary-foreground tabular-nums">
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      )}
    </Link>
  );

  // ---- Contents, shared by every layout ----

  const brand = (
    <SidebarBrand
      collapsed={rail}
      fullPage={fullPage}
      onClose={onClose}
      onToggle={floats ? () => setSidebarPrefs({ pinned: !pinned }) : toggleSidebar}
      pinned={floats ? pinned : undefined}
    />
  );

  const trees = (
    <div className="flex flex-col gap-4">
      <SidebarTree group={DISCOVER} active={active} onNavigate={handleMobileNav} fluid={fluid} />
      <SidebarTree group={PROFILE} active={active} onNavigate={handleMobileNav} avatar={avatar} aside={bell} fluid={fluid} />
    </div>
  );

  // Settings › Sidebar can turn it off (then it isn't even fetched).
  const tonight = prefs.tonight === 'off' ? null : <SidebarTonight onNavigate={handleMobileNav} show={prefs.tonight} />;

  // Feature announcement: copy from the newest changelog's "Promotional"
  // section, dismissal keyed per release. Scrolls with the nav so it never
  // pushes it off screen.
  const promoCard = promo && (
    <SidebarAnnouncementCard
      key={promo.slug}
      title={promo.title}
      description={promo.description}
      ctaLabel={promo.ctaLabel}
      ctaHref={promo.ctaHref}
      storageKey={`watchly_announce_${promo.slug}`}
      onCtaClick={handleMobileNav}
      // Sidebar is always-dark: override the theme-flipping card tokens
      // with white-alpha surfaces so it stays correct in light mode too.
      className="border-white/10 bg-white/[0.04] shadow-none"
    />
  );

  const footer = rail ? (
    <div className="flex shrink-0 flex-col items-center gap-1 pb-4 pt-2">
      <RailLink node={{ id: 'settings', href: PATHS.SETTINGS.ROOT, label: 'Settings', icon: Settings }} on={onSettings} />
      <SidebarRegion collapsed />
      <SignOutButton onClick={() => setConfirmOpen(true)} disabled={signingOut} rail />
    </div>
  ) : (
    <div className="min-w-[264px] shrink-0 border-t border-white/5 px-2 pb-3 pt-2">
      <SidebarRegion />
      <div className="mt-1 flex items-center gap-0.5">
        <Link
          href={PATHS.SETTINGS.ROOT}
          onClick={handleMobileNav}
          aria-current={onSettings ? 'page' : undefined}
          className={cn(
            'flex h-9 flex-1 items-center gap-2.5 rounded-lg px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            onSettings ? 'bg-white/10 text-foreground' : 'text-muted-foreground hover:bg-white/5 hover:text-foreground',
          )}
        >
          <Settings size={17} aria-hidden /> Settings
        </Link>
        <SignOutButton onClick={() => setConfirmOpen(true)} disabled={signingOut} />
      </div>
      <nav aria-label="Footer" className="flex flex-wrap items-center gap-x-2.5 gap-y-1 px-3 pt-1.5 text-[11px] text-muted-foreground">
        <FooterLink href={EXTERNAL_PATHS.BUSINESS.TERMS_OF_SERVICE} onClick={handleMobileNav}>Terms</FooterLink>
        <span aria-hidden className="opacity-40">·</span>
        <FooterLink href={PATHS.BUSINESS.PRIVACY_POLICY} onClick={handleMobileNav}>Privacy</FooterLink>
        <span aria-hidden className="opacity-40">·</span>
        <FooterLink href={PATHS.CHANGELOGS} onClick={handleMobileNav}>What&apos;s new</FooterLink>
        <span aria-hidden className="opacity-40">·</span>
        <a href={PATHS.BUSINESS.CONTACT} className="rounded-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Feedback
        </a>
      </nav>
    </div>
  );

  const confirm = (
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
  );

  // ---- Surfaces ----

  // Docked: always-dark even in light theme. Override foreground/muted-
  // foreground inside so descendant text utilities resolve to their dark-mode
  // values. Sets both the base vars and the `--color-*` aliases Tailwind v4
  // reads (mirrors the same dual-write pattern AccentScope uses). Floating
  // also says what colour its surface is, for the ticket's punched notches.
  const translucent = floats && floating.translucent;
  const vars = {
    '--foreground': '#fafafa',
    '--muted-foreground': '#a1a1aa',
    '--color-foreground': '#fafafa',
    '--color-muted-foreground': '#a1a1aa',
    '--sidebar-surface': translucent ? 'rgb(12 13 20 / 0.72)' : '#0c0d14',
  } as React.CSSProperties;
  // A floating surface: lifted off the page by a soft shadow (depth, not a
  // glow), a hairline edge, and either solid or letting the page show through.
  const floatSurface = cn(
    'rounded-[22px] border border-white/[0.07] shadow-[0_18px_48px_-18px_rgb(0_0_0/0.7)]',
    translucent ? 'bg-[#0c0d14]/72 backdrop-blur-xl backdrop-saturate-150' : 'bg-[#0c0d14]',
  );
  const widthTransition = floats ? (fluid ? FLUID_SPRING : { duration: 0 }) : sidebarSpring;

  return (
    <motion.aside
      // Animated width is meaningless when the parent gives us the full
      // viewport — skip the spring entirely in fullPage mode.
      animate={width === undefined ? undefined : { width }}
      transition={widthTransition}
      style={vars}
      onMouseEnter={hoverable ? () => peekTo(true, 90) : undefined}
      onMouseLeave={hoverable ? (e) => !inSidebarLayer(e.relatedTarget) && peekTo(false, 220) : undefined}
      onFocus={hoverable ? () => peekTo(true, 0) : undefined}
      onBlur={
        hoverable
          ? (e) => {
              const to = e.relatedTarget as Node | null;
              if (!e.currentTarget.contains(to) && !inSidebarLayer(to)) peekTo(false, 0);
            }
          : undefined
      }
      onKeyDown={hoverable ? (e) => e.key === 'Escape' && setPeek(false) : undefined}
      className={cn(
        'h-full flex flex-col overflow-hidden text-foreground',
        floats ? floatSurface : cn('bg-[#0c0d14]', fullPage ? 'w-full' : 'border-r border-white/5'),
        fullPage && 'w-full',
      )}
    >
      {brand}

      {rail ? (
        <SidebarRail active={active} avatar={avatar} bell={bell} />
      ) : (
        <motion.div
          // Floating: the panel's contents arrive just behind the width, so they never squeeze.
          initial={fluid ? { opacity: 0 } : false}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.18, delay: 0.06 }}
          className="flex min-h-0 min-w-[264px] flex-1 flex-col"
        >
          {/* Search stays put at the top; everything under it scrolls. */}
          <div className="shrink-0 px-2">
            <SidebarSearch onNavigate={handleMobileNav} />
          </div>
          {/* Scrolls without a visible scrollbar. */}
          <nav aria-label="Main" className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-2 pb-2">
            {trees}
            {tonight && <div className="mt-7 px-1">{tonight}</div>}
            {promoCard && <div className="mt-4 px-1">{promoCard}</div>}
          </nav>
        </motion.div>
      )}

      {footer}
      {confirm}
    </motion.aside>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

/**
 * Popovers the sidebar opens (Tonight's info, the region picker) live in
 * portals outside it; moving into one mustn't fold the floating sidebar away.
 */
function inSidebarLayer(node: EventTarget | null): boolean {
  return node instanceof Element && !!node.closest('[data-sidebar-layer]');
}

const ICON_BUTTON = 'rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground cursor-pointer';

function SidebarBrand({
  collapsed,
  fullPage,
  onClose,
  onToggle,
  pinned,
}: {
  collapsed: boolean;
  fullPage: boolean;
  onClose?: () => void;
  onToggle: () => void;
  /** Floating: the toggle pins the panel open instead of collapsing it. */
  pinned?: boolean;
}) {
  const pinButton = pinned !== undefined && (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={pinned}
      aria-label={pinned ? 'Let the sidebar fold away' : 'Keep the sidebar open'}
      title={pinned ? 'Let it fold away' : 'Keep it open'}
      className={ICON_BUTTON}
    >
      {pinned ? <PinOff size={17} /> : <Pin size={17} />}
    </button>
  );
  if (fullPage) {
    // Phone menu: centred brand, close on the right, no collapse toggle.
    return (
      <div className="relative flex h-16 shrink-0 items-center justify-center px-4">
        <Link href={PATHS.BASE_URL} onClick={onClose}>
          <Image src="/brand-light.svg" alt="Watchly" width={32} height={32} className="mt-2 h-auto w-auto" priority />
        </Link>
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Close menu" className={cn('absolute right-3 top-1/2 -translate-y-1/2 p-2', ICON_BUTTON)}>
            <X size={20} />
          </button>
        )}
      </div>
    );
  }
  if (collapsed) {
    return (
      <div className="flex h-16 shrink-0 items-center justify-center">
        {pinButton || <button type="button" onClick={onToggle} aria-label="Expand sidebar" className={ICON_BUTTON}>
          <PanelLeft size={18} />
        </button>}
      </div>
    );
  }
  return (
    <div className="flex h-16 shrink-0 items-center justify-between px-4">
      <Link href={PATHS.BASE_URL}>
        <Image src="/brand-light.svg" alt="Watchly" width={32} height={32} className="mt-2 h-auto w-auto" />
      </Link>
      {pinButton || (
        <button type="button" onClick={onToggle} aria-label="Collapse sidebar" className={ICON_BUTTON}>
          <PanelLeftClose size={18} />
        </button>
      )}
    </div>
  );
}

function RailLink({ node, on, children }: { node: NavNode; on: boolean; children?: React.ReactNode }) {
  const Icon = node.icon;
  return (
    <Link
      href={node.href}
      title={node.label}
      aria-label={node.label}
      aria-current={on ? 'page' : undefined}
      className={cn(
        'mx-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        on ? 'bg-white/10 text-primary' : 'text-muted-foreground hover:bg-white/5 hover:text-foreground',
      )}
    >
      {children ?? <Icon size={19} aria-hidden />}
    </Link>
  );
}

/** Collapsed: every destination is its own icon (no flyouts), named on hover. */
function SidebarRail({ active, avatar, bell }: { active: string | null; avatar: React.ReactNode; bell: React.ReactNode }) {
  const router = useRouter();
  useSearchShortcut(() => router.push(PATHS.DISCOVER));
  const divider = <div className="mx-auto my-1.5 h-px w-6 shrink-0 bg-white/10" aria-hidden />;
  return (
    <nav aria-label="Main" className="no-scrollbar flex flex-1 flex-col gap-1 overflow-y-auto py-2">
      <RailLink node={{ id: 'search', href: PATHS.DISCOVER, label: 'Search (/)', icon: Search }} on={false} />
      {divider}
      {[DISCOVER.parent, ...DISCOVER.children].map((n) => (
        <RailLink key={n.id} node={n} on={active === n.id} />
      ))}
      {divider}
      <RailLink node={PROFILE.parent} on={active === PROFILE.parent.id}>
        {avatar}
      </RailLink>
      {PROFILE.children.map((n) => (
        <RailLink key={n.id} node={n} on={active === n.id} />
      ))}
      {divider}
      {bell}
    </nav>
  );
}

function SignOutButton({ onClick, disabled, rail }: { onClick: () => void; disabled: boolean; rail?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title="Sign out"
      aria-label="Sign out"
      className={cn(
        'flex shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground cursor-pointer',
        'disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        rail ? 'h-10 w-10' : 'h-9 w-9',
      )}
    >
      <LogOut size={rail ? 19 : 17} aria-hidden />
    </button>
  );
}

function FooterLink({ href, onClick, children }: { href: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Link href={href} onClick={onClick} className="rounded-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {children}
    </Link>
  );
}
