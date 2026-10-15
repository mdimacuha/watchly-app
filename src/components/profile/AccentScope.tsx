import type { CSSProperties, ReactNode } from 'react';
import { getAccent, type AccentSlug } from '@/constants/accentColors';

interface AccentScopeProps {
  /** Accent slug for the surface owner. `null` = default Watchly accent (no override). */
  accentColor: AccentSlug | null | undefined;
  children: ReactNode;
  className?: string;
  /** Render as a different element if the default `<div>` introduces layout issues. */
  as?: 'div' | 'section' | 'main';
}

/**
 * Scopes the user's accent color to the subtree it wraps. Overrides the same
 * CSS variables defined in src/styles/tokens.css (`--primary` + hover/active
 * /soft/ring) on its root element, so Tailwind classes like `bg-primary`,
 * `text-primary`, `ring-ring` etc. resolve to the accent palette inside.
 *
 * Outside this wrapper (e.g. the sidebar), tokens fall back to the document
 * defaults. Null/undefined accent = pass-through (no inline style).
 */
export function AccentScope({
  accentColor,
  children,
  className,
  as = 'div',
}: AccentScopeProps) {
  const accent = getAccent(accentColor ?? null);

  // No override needed — render children with the same shape so the parent's
  // grid/flex layout is preserved.
  if (!accent) {
    const Tag = as;
    return <Tag className={className}>{children}</Tag>;
  }

  // Override both layers:
  //   --primary etc.       — the base vars defined in :root (tokens.css)
  //   --color-primary etc. — the @theme-exposed names Tailwind utilities
  //                          actually reference (e.g. `bg-primary` compiles
  //                          to `background-color: var(--color-primary)`).
  // Setting both means we don't have to assume whether Tailwind v4 flattens
  // chained variables at build time.
  const style: CSSProperties & Record<string, string> = {
    '--primary': accent.primary,
    '--primary-hover': accent.primaryHover,
    '--primary-active': accent.primaryActive,
    '--primary-soft': accent.primarySoft,
    '--ring': accent.ring,
    '--color-primary': accent.primary,
    '--color-primary-hover': accent.primaryHover,
    '--color-primary-active': accent.primaryActive,
    '--color-primary-soft': accent.primarySoft,
    '--color-ring': accent.ring,
  };

  const Tag = as;
  return (
    <Tag className={className} style={style}>
      {children}
    </Tag>
  );
}
