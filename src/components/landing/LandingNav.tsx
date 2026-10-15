'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, usePathname } from 'next/navigation';
import { Search, X, LogOut } from 'lucide-react';
import { WatchlySearch, Suggestion } from '@/components/watchly/Search';
import { motion, AnimatePresence } from 'framer-motion';
import { PATHS, EXTERNAL_PATHS } from '@/lib/app';
import { useAuthStore } from '@/client/stores/auth';
import { UserAvatar } from '@/components/ui/user-avatar';
import { ConfirmDestructiveModal } from '@/components/ui/ConfirmDestructiveModal';

// Mock suggestions for the landing page search
const MOCK_SUGGESTIONS: Suggestion[] = [
  { id: '1', title: 'Dune: Part Two', year: '2024', mediaType: 'movie' },
  { id: '2', title: 'The Bear', year: '2023', mediaType: 'tv' },
  { id: '3', title: 'Fallout', year: '2024', mediaType: 'tv' },
  { id: '4', title: 'Civil War', year: '2024', mediaType: 'movie' },
  { id: '5', title: 'Shogun', year: '2024', mediaType: 'movie' },
];

export function LandingNav() {
  const router = useRouter();
  const pathname = usePathname();
  const { status, user, clear } = useAuthStore();
  const signInHref =
    pathname && pathname !== '/'
      ? `${PATHS.AUTH.SIGN_IN}?redirect=${encodeURIComponent(pathname)}`
      : PATHS.AUTH.SIGN_IN;
  // Logo destination mirrors the `/` redirect but skips the hop: signed-in →
  // app profile, signed-out → the marketing site (gowatchly.com). While auth
  // state is still resolving, fall back to `/` and let the server redirect.
  const logoHref =
    status === 'authenticated'
      ? PATHS.ME
      : status === 'unauthenticated'
        ? EXTERNAL_PATHS.LANDING_URL
        : PATHS.BASE_URL;
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const [isDesktopSearchOpen, setIsDesktopSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [signingOut, setSigningOut] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const desktopSearchRef = useRef<HTMLDivElement>(null);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await fetch('/api/v1/auth/signout', { method: 'POST' });
    } catch {
      // Best-effort — clear client state regardless
    }
    clear();
    router.push(PATHS.AUTH.SIGN_IN);
  };

  // Close desktop search when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        desktopSearchRef.current &&
        !desktopSearchRef.current.contains(event.target as Node)
      ) {
        if (!query) {
          // Only close if search is empty to avoid accidental closing while typing
          setIsDesktopSearchOpen(false);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [query]);

  // Simple filtering logic for the mock suggestions
  const filteredSuggestions = query
    ? MOCK_SUGGESTIONS.filter((item) =>
        item.title.toLowerCase().includes(query.toLowerCase())
      )
    : [];

  return (
    <header className="w-full fixed top-0 z-50 backdrop-blur-sm bg-background/50 border-b border-white/5">
      <div className="container mx-auto px-6 h-22 flex items-center justify-between relative">
        {/* Left: Logo */}
        <Link href={logoHref} className="flex items-center gap-2 group z-20">
          <Image
            src="/brand-light.svg"
            alt="Watchly Logo"
            width={32}
            height={32}
            // Above the fold on every landing page and frequently the LCP
            // element. `priority` flips loading to eager + preloads the
            // asset, eliminating the dev-mode warning.
            priority
            className="w-auto h-auto mt-2"
          />
        </Link>

        {/* Desktop Search (Visible on md+) */}
        {/* We use flex-1 to push the right actions to the end, but the search itself aligns right */}
        <div className="hidden md:flex flex-1 justify-end items-center mr-6 relative h-full">
          <div
            ref={desktopSearchRef}
            className="relative flex items-center justify-end"
          >
            <AnimatePresence>
              {isDesktopSearchOpen ? (
                <motion.div
                  initial={{ width: 40, opacity: 0 }}
                  animate={{ width: 300, opacity: 1 }}
                  exit={{ width: 40, opacity: 0 }}
                  transition={{ duration: 0.3, ease: 'easeOut' }}
                  className="overflow-hidden"
                >
                  <WatchlySearch
                    variant="compact"
                    placeholder="Search movies or shows..."
                    suggestions={filteredSuggestions}
                    onChange={setQuery}
                    className="w-full"
                  />
                </motion.div>
              ) : (
                <motion.button
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.2 }}
                  onClick={() => setIsDesktopSearchOpen(true)}
                  className="p-2 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Open search"
                >
                  <Search className="w-5 h-5" />
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-4 z-20">
          {/* Mobile Search Trigger (Visible on < md) */}
          <button
            onClick={() => setIsMobileSearchOpen(true)}
            className="md:hidden p-2 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Search"
          >
            <Search className="w-5 h-5" />
          </button>

          {status === 'unknown' && (
            <span className="w-16 h-5 rounded bg-muted/50 animate-pulse" />
          )}

          {status === 'unauthenticated' && (
            <Link
              href={signInHref}
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Sign In
            </Link>
          )}

          {status === 'authenticated' && user && (
            <div className="flex items-center gap-3">
              <span title={`@${user.username}`} aria-label={`@${user.username}`}>
                <UserAvatar
                  href="/me"
                  avatarUrl={user.avatarUrl}
                  firstName={user.firstName}
                  lastName={user.lastName}
                  size="sm"
                />
              </span>
              <button
                onClick={() => setConfirmOpen(true)}
                disabled={signingOut}
                className="p-2 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                aria-label="Sign out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Mobile Full-Screen Search Overlay */}
      <AnimatePresence>
        {isMobileSearchOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-background/95 backdrop-blur-md flex flex-col p-6 md:hidden"
          >
            <div className="flex items-center justify-end mb-8">
              <button
                onClick={() => setIsMobileSearchOpen(false)}
                className="p-2 -mr-2 text-muted-foreground hover:text-foreground"
                aria-label="Close search"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="w-full">
              <h2 className="text-2xl font-bold mb-6 text-center">
                Search Watchly
              </h2>
              <WatchlySearch
                variant="default"
                placeholder="What do you want to watch?"
                suggestions={filteredSuggestions}
                onChange={setQuery}
                onSubmit={() => setIsMobileSearchOpen(false)}
                className="w-full"
                // Auto-focus logic would typically go here or inside the component via a prop
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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
    </header>
  );
}
