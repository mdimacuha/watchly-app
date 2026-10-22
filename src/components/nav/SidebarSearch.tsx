'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { PATHS } from '@/lib/app';

/**
 * Runs `onOpen` on "/" (outside a text field) or ⌘K / Ctrl+K. Off on
 * Discover, where the page's own search box owns "/".
 */
export function useSearchShortcut(onOpen: () => void) {
  const pathname = usePathname();
  const onDiscover = pathname === PATHS.DISCOVER;
  useEffect(() => {
    if (onDiscover) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target instanceof Element ? e.target : null;
      const typing = !!t?.closest('input, textarea, select, [contenteditable="true"]');
      const slash = e.key === '/' && !typing && !e.metaKey && !e.ctrlKey && !e.altKey;
      if (slash || (e.key === 'k' && (e.metaKey || e.ctrlKey))) {
        e.preventDefault();
        onOpen();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDiscover, onOpen]);
}

/** Search from anywhere: Enter opens Discover with the query. */
export function SidebarSearch({ onNavigate }: { onNavigate: () => void }) {
  const router = useRouter();
  const ref = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState('');
  useSearchShortcut(() => ref.current?.focus());

  return (
    <form
      role="search"
      className="relative mx-1 mb-3"
      onSubmit={(e) => {
        e.preventDefault();
        const query = q.trim();
        router.push(query ? `${PATHS.DISCOVER}?q=${encodeURIComponent(query)}` : PATHS.DISCOVER);
        onNavigate();
        setQ('');
        ref.current?.blur();
      }}
    >
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <input
        ref={ref}
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search titles, people"
        aria-label="Search titles and people"
        enterKeyHint="search"
        className="h-10 w-full rounded-lg border border-white/10 bg-white/[0.04] pl-9 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:border-white/25 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
      />
      <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-white/10 px-1.5 text-[10px] font-medium text-muted-foreground">
        /
      </kbd>
    </form>
  );
}
