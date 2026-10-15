'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';

export type Theme = 'system' | 'dark' | 'light';
type ResolvedTheme = 'dark' | 'light';

// localStorage key AND cookie name are intentionally identical — the
// signin route writes `watchly_theme` from DB.theme, and the anti-FOUC
// script reads whichever is present (cookie wins on first paint after a
// fresh signin; localStorage takes over once React syncs on mount).
export const THEME_STORAGE_KEY = 'watchly_theme';

interface ThemeContextValue {
  theme: Theme;
  resolved: ResolvedTheme;
  setTheme: (next: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readCookieTheme(): Theme | null {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.match(/(?:^|;\s*)watchly_theme=([^;]+)/);
  const v = m ? decodeURIComponent(m[1]) : null;
  return v === 'system' || v === 'dark' || v === 'light' ? v : null;
}

function readStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  // Cookie takes priority over localStorage: a fresh signin on a new
  // device should immediately surface the user's saved theme without
  // waiting for a localStorage write from prior sessions.
  const cookie = readCookieTheme();
  if (cookie) return cookie;
  const v = window.localStorage.getItem(THEME_STORAGE_KEY);
  return v === 'system' || v === 'dark' || v === 'light' ? v : 'dark';
}

function resolveTheme(theme: Theme): ResolvedTheme {
  if (theme !== 'system') return theme;
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: light)').matches
    ? 'light'
    : 'dark';
}

function applyToDocument(resolved: ResolvedTheme): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.toggle('light', resolved === 'light');
  root.classList.toggle('dark', resolved === 'dark');
}

/**
 * Theme provider for client-side theme management. The anti-FOUC inline
 * script in the root layout has already set the class on <html> before
 * first paint, so this provider's job is just to (1) keep React in sync
 * with the resolved theme, (2) react to setTheme calls, and (3) listen to
 * OS-level prefers-color-scheme changes when in 'system' mode.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Default to whatever's already in localStorage (matches what the
  // anti-FOUC script read). Server render uses 'dark' fallback — that's
  // safe since the inline script will have corrected the class by the time
  // React mounts on the client.
  const [theme, setThemeState] = useState<Theme>('dark');
  const [resolved, setResolved] = useState<ResolvedTheme>('dark');

  useEffect(() => {
    // localStorage is client-only, so the on-mount sync genuinely needs an
    // effect — there's no "derive from props" alternative here. The anti-
    // FOUC script has already set the <html> class; this just brings React
    // state into agreement so useTheme() consumers read the right value.
    const stored = readStoredTheme();
    const next = resolveTheme(stored);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setThemeState(stored);
    setResolved(next);
    applyToDocument(next);
    // If the cookie supplied the value (fresh signin), mirror it into
    // localStorage so subsequent setTheme calls only need to touch one
    // store. Cookie keeps living until the next signin overwrites it.
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, stored);
    } catch {
      // localStorage may be disabled (private mode) — non-fatal.
    }
  }, []);

  // When in 'system' mode, follow OS-level changes live.
  useEffect(() => {
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = () => {
      const next: ResolvedTheme = mq.matches ? 'light' : 'dark';
      setResolved(next);
      applyToDocument(next);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    window.localStorage.setItem(THEME_STORAGE_KEY, next);
    const resolved = resolveTheme(next);
    setThemeState(next);
    setResolved(resolved);
    applyToDocument(resolved);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, resolved, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used inside <ThemeProvider>');
  }
  return ctx;
}

/**
 * Inline script that runs synchronously in the document <head> before any
 * React code, so first paint already has the right theme class on <html>.
 * Without this, users would see a dark→light (or vice versa) flash on each
 * page load.
 *
 * Reads the `watchly_theme` cookie first (set server-side on signin from
 * DB.theme), then falls back to localStorage. Cookie wins on a fresh
 * signin so the user's saved theme follows them across devices without a
 * client round-trip; subsequent setTheme calls write to localStorage and
 * take over once React mounts.
 *
 * The string is rendered with `dangerouslySetInnerHTML` from the root
 * layout. Keep it terse — every character ships on every page.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var m=document.cookie.match(/(?:^|;\\s*)${THEME_STORAGE_KEY}=([^;]+)/);var c=m?decodeURIComponent(m[1]):null;var s=(c==='light'||c==='dark'||c==='system')?c:localStorage.getItem('${THEME_STORAGE_KEY}');var t=s==='light'||s==='dark'||s==='system'?s:'dark';var r=t==='system'?(window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'):t;var cl=document.documentElement.classList;cl.toggle('light',r==='light');cl.toggle('dark',r==='dark');}catch(e){document.documentElement.classList.add('dark');}})();`;
