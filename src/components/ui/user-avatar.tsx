'use client';

import Link from 'next/link';
import { cn } from '@/lib/cn';
import Image from 'next/image';

interface UserAvatarProps {
  /** Full URL to the user's avatar image. Falls back to initials if empty. */
  avatarUrl?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  /** px size variant. */
  size?: 'sm' | 'md' | 'lg';
  /** If provided, the avatar is wrapped in a Link to this href. */
  href?: string;
  className?: string;
}

const SIZE_CLASSES = {
  sm: 'w-6 h-6 text-[9px]',
  md: 'w-8 h-8 text-[11px]',
  lg: 'w-10 h-10 text-sm',
} as const;

// Intrinsic pixel hints for next/image. CSS classes (or className overrides
// from the caller) still control the actual rendered size — these just
// satisfy Next's width/height requirement.
const SIZE_PX = {
  sm: 24,
  md: 32,
  lg: 40,
} as const;

function getInitials(firstName?: string | null, lastName?: string | null) {
  const f = firstName?.trim().charAt(0).toUpperCase() ?? '';
  const l = lastName?.trim().charAt(0).toUpperCase() ?? '';
  return f + l || '?';
}

// Stable, hash-based gradient so the same user always gets the same swatch.
const GRADIENTS = [
  'from-indigo-500 to-fuchsia-500',
  'from-emerald-500 to-cyan-500',
  'from-amber-500 to-rose-500',
  'from-sky-500 to-violet-500',
  'from-pink-500 to-orange-500',
  'from-teal-500 to-blue-500',
  'from-purple-500 to-pink-500',
  'from-lime-500 to-emerald-500',
] as const;

function gradientFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return GRADIENTS[h % GRADIENTS.length];
}

export function UserAvatar({
  avatarUrl,
  firstName,
  lastName,
  size = 'md',
  href,
  className,
}: UserAvatarProps) {
  const hasImage = !!avatarUrl;
  const initials = getInitials(firstName, lastName);

  const avatar = hasImage ? (
    <Image
      src={avatarUrl}
      alt={`${firstName ?? ''} ${lastName ?? ''}`.trim() || 'User avatar'}
      width={SIZE_PX[size]}
      height={SIZE_PX[size]}
      className={cn(
        'rounded-full object-cover shrink-0',
        SIZE_CLASSES[size],
        className
      )}
    />
  ) : (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-full text-white font-bold shrink-0 select-none bg-gradient-to-br',
        gradientFor(`${firstName ?? ''}${lastName ?? ''}` || '?'),
        SIZE_CLASSES[size],
        className
      )}
    >
      {initials}
    </span>
  );

  if (href) {
    return (
      <Link href={href} className="cursor-pointer">
        {avatar}
      </Link>
    );
  }

  return avatar;
}
