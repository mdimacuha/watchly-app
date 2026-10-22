'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';
import { StatusPill } from '@/components/watchly/StatusPill';
import type { NavGroup, NavNode } from './sidebarNav';

interface SidebarTreeProps {
  group: NavGroup;
  active: string | null;
  onNavigate: () => void;
  /** Replaces the parent's icon (My Profile shows your avatar). */
  avatar?: React.ReactNode;
  /** Sits to the right of the parent row (My Profile's bell). */
  aside?: React.ReactNode;
  /**
   * Fluid motion (floating sidebar): the current-page highlight glides to the
   * new row on navigation and a hover highlight follows the pointer, instead
   * of each row painting its own background.
   */
  fluid?: boolean;
}

const GLIDE = { type: 'spring' as const, stiffness: 520, damping: 42, mass: 0.7 };

/** A row's background: painted (default) or one shared, gliding highlight (fluid). */
function RowBackdrop({ on, hovered, fluid }: { on: boolean; hovered: boolean; fluid: boolean }) {
  if (!fluid) return null;
  if (on) return <motion.span layoutId="sidebar-active" transition={GLIDE} aria-hidden className="absolute inset-0 rounded-lg bg-white/[0.08]" />;
  if (hovered) return <motion.span layoutId="sidebar-hover" transition={GLIDE} aria-hidden className="absolute inset-0 rounded-lg bg-white/[0.045]" />;
  return null;
}

/**
 * One section of the nav drawn as a tree: the parent, then each child on its
 * own elbow off a guide line. The way to the current page lights up: the
 * parent's icon, the line down to it, its elbow and its icon.
 */
export function SidebarTree({ group, active, onNavigate, avatar, aside, fluid = false }: SidebarTreeProps) {
  const { parent, children } = group;
  const ParentIcon = parent.icon;
  const parentOn = active === parent.id;
  const childAt = children.findIndex((n) => n.id === active);
  const inside = parentOn || childAt >= 0;
  const [hover, setHover] = useState<string | null>(null);
  const hoverProps = (n: NavNode) =>
    fluid ? { onMouseEnter: () => setHover(n.id), onFocus: () => setHover(n.id), onBlur: () => setHover(null) } : {};

  return (
    <section onMouseLeave={fluid ? () => setHover(null) : undefined}>
      <div className="flex items-center">
        <Link
          href={parent.href}
          onClick={onNavigate}
          aria-current={parentOn ? 'page' : undefined}
          {...hoverProps(parent)}
          className={cn(
            'relative flex h-10 min-w-0 flex-1 items-center gap-3 rounded-lg px-3 text-[15px] font-semibold tracking-tight transition-colors',
            parentOn ? cn('text-foreground', !fluid && 'bg-white/[0.07]') : inside ? 'text-foreground' : 'text-foreground/80 hover:text-foreground',
          )}
        >
          <RowBackdrop on={parentOn} hovered={hover === parent.id} fluid={fluid} />
          <span className="relative shrink-0">
            {avatar ?? <ParentIcon size={18} className={inside ? 'text-primary' : 'text-muted-foreground'} aria-hidden />}
          </span>
          <span className="relative truncate">{parent.label}</span>
        </Link>
        {aside}
      </div>

      <ul className="ml-[21px]">
        {children.map((n, i) => {
          const Icon = n.icon;
          const on = active === n.id;
          return (
            <li key={n.id} className="relative">
              {/* Guide line past this row (none after the last child); lit above the current page. */}
              {i < children.length - 1 && (
                <span aria-hidden className={cn('absolute inset-y-0 left-0 w-px transition-colors duration-300', i < childAt ? 'bg-primary' : 'bg-white/12')} />
              )}
              {/* Elbow from the line into this row. */}
              <span
                aria-hidden
                className={cn('absolute left-0 top-0 h-[18px] w-3 rounded-bl-lg border-b border-l transition-colors duration-300', on ? 'border-primary' : 'border-white/12')}
              />
              <Link
                href={n.href}
                onClick={onNavigate}
                aria-current={on ? 'page' : undefined}
                {...hoverProps(n)}
                className={cn(
                  'group relative ml-4 flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm transition-colors',
                  on
                    ? cn('font-medium text-foreground', !fluid && 'bg-white/[0.07]')
                    : cn('text-muted-foreground hover:text-foreground', !fluid && 'hover:bg-white/[0.04]'),
                )}
              >
                <RowBackdrop on={on} hovered={hover === n.id} fluid={fluid} />
                <Icon size={16} className={cn('relative shrink-0', on ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground')} aria-hidden />
                <span className="relative min-w-0 truncate">{n.label}</span>
                {n.pill && <StatusPill kind={n.pill} size="sm" className="relative ml-auto shrink-0" />}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
