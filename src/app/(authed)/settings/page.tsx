'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Settings,
  ChevronRight,
  Globe,
  Lock,
  AtSign,
  Sun,
  Bell,
  Filter,
  KeyRound,
  Trash2,
  LogOut,
} from 'lucide-react';
import { useToast } from '@/hooks/useToast';
import { useAuthStore } from '@/client/stores/auth';
import { ConfirmDestructiveModal } from '@/components/ui/ConfirmDestructiveModal';

const SECTIONS: Array<{
  href: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}> = [
  {
    href: '/settings/region',
    label: 'Region',
    description: 'Where you watch from. Affects availability badges.',
    icon: Globe,
  },
  {
    href: '/settings/privacy',
    label: 'Privacy',
    description: 'Who can see your profile, watchlists, and favorites.',
    icon: Lock,
  },
  {
    href: '/settings/account',
    label: 'Account',
    description: 'Change your email or password.',
    icon: AtSign,
  },
  {
    href: '/settings/appearance',
    label: 'Appearance',
    description: 'Theme — dark, light, or match your system.',
    icon: Sun,
  },
  {
    href: '/settings/notifications',
    label: 'Notifications',
    description: 'Pick which events trigger your bell.',
    icon: Bell,
  },
  {
    href: '/settings/preferences',
    label: 'For You preferences',
    description: 'Filter For You rows to your selected streaming services.',
    icon: Filter,
  },
  // {
  //   href: '/settings/api-tokens',
  //   label: 'API tokens',
  //   description: 'Personal access tokens for external clients.',
  //   icon: KeyRound,
  // },
];

export default function SettingsPage() {
  const router = useRouter();
  const toast = useToast();
  const clearAuth = useAuthStore((s) => s.clear);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleLogout = async () => {
    try {
      const res = await fetch('/api/v1/auth/signout', { method: 'POST' });
      if (!res.ok) throw new Error('Sign out failed');
      clearAuth();
      router.push('/signin');
    } catch {
      toast.error('Sign out failed', 'Could not sign you out. Please try again.');
    }
  };

  return (
    <div className="px-8 py-10 max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <Settings size={24} className="text-primary" />
        <h1 className="text-h2">Settings</h1>
      </div>
      <p className="text-muted-foreground text-body-regular mb-8">
        Manage your account preferences, region, and privacy.
      </p>

      <div className="space-y-1">
        {SECTIONS.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="flex items-center justify-between px-4 py-3 rounded-lg hover:bg-white/5 transition-colors group"
          >
            <span className="flex items-center gap-3 min-w-0">
              <s.icon size={18} className="text-muted-foreground shrink-0" />
              <span className="flex flex-col min-w-0">
                <span className="text-sm font-medium text-foreground">
                  {s.label}
                </span>
                <span className="text-xs text-muted-foreground truncate">
                  {s.description}
                </span>
              </span>
            </span>
            <ChevronRight
              size={16}
              className="text-muted-foreground group-hover:text-foreground transition-colors shrink-0"
            />
          </Link>
        ))}
      </div>

      <div className="border-t border-border/40 mt-8 pt-6 space-y-1">
        <Link
          href="/settings/delete"
          className="flex items-center justify-between px-4 py-3 rounded-lg hover:bg-destructive/10 transition-colors group"
        >
          <span className="flex items-center gap-3 text-sm font-medium text-destructive">
            <Trash2 size={18} />
            Delete account
          </span>
          <ChevronRight
            size={16}
            className="text-destructive/70 group-hover:text-destructive transition-colors"
          />
        </Link>

        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-foreground hover:bg-white/5 transition-colors cursor-pointer w-full"
        >
          <LogOut size={18} className="text-muted-foreground" />
          Sign out
        </button>
      </div>

      <ConfirmDestructiveModal
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleLogout}
        icon={LogOut}
        title="Sign out?"
        description="You'll need to sign in again to access your watchlists and recommendations."
        confirmLabel="Sign out"
        cancelLabel="Cancel"
      />
    </div>
  );
}
