'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

interface SidebarNavItemProps {
  href: string;
  icon: LucideIcon;
  label: string;
  isActive: boolean;
  /** When true the sidebar is in icon-rail mode. */
  collapsed?: boolean;
  /** Optional avatar element rendered instead of the icon. */
  avatar?: React.ReactNode;
  /** Optional trailing badge (e.g. "Experimental") shown only when the
   *  sidebar is expanded — collapsed rail stays icon-only. */
  badge?: React.ReactNode;
  onClick?: () => void;
}

export function SidebarNavItem({
  href,
  icon: Icon,
  label,
  isActive,
  collapsed = false,
  avatar,
  badge,
  onClick,
}: SidebarNavItemProps) {
  return (
    <Link
      href={href}
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={cn(
        'relative flex items-center rounded-lg text-sm font-medium transition-colors',
        collapsed ? 'justify-center h-11 w-11 mx-auto' : 'gap-3 px-3 h-11',
        isActive
          ? 'text-foreground'
          : 'text-muted-foreground hover:text-foreground hover:bg-white/5',
      )}
    >
      {/* Animated active pill behind the item */}
      {isActive && (
        <motion.div
          layoutId="sidebar-active-pill"
          className="absolute inset-0 rounded-lg bg-white/10"
          transition={{ type: 'spring', stiffness: 350, damping: 30 }}
        />
      )}

      <span
        className={cn(
          'relative z-10 flex items-center min-w-0',
          collapsed ? 'justify-center' : 'gap-3 w-full',
        )}
      >
        {avatar ?? <Icon size={20} />}
        {!collapsed && (
          <>
            <span className="truncate">{label}</span>
            {badge && <span className="ml-auto shrink-0">{badge}</span>}
          </>
        )}
      </span>
    </Link>
  );
}
