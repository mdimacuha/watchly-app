'use client';

import { useTransition } from 'react';
import { Sun, Moon, MonitorSmartphone, Check } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useTheme, type Theme } from '@/components/theme/ThemeProvider';
import { useToast } from '@/hooks/useToast';
import { updateThemeAction } from '@/actions/settings';
import { BackLink } from '@/components/nav/BackLink';
import { BannerToggle } from '@/components/profile/BannerToggle';

interface ThemeOption {
  value: Theme;
  label: string;
  description: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

const OPTIONS: ThemeOption[] = [
  {
    value: 'system',
    label: 'System',
    description: 'Follow your operating system preference.',
    icon: MonitorSmartphone,
  },
  {
    value: 'dark',
    label: 'Dark',
    description: 'Watchly classic.',
    icon: Moon,
  },
  {
    value: 'light',
    label: 'Light',
    description: 'Bright, daytime-friendly.',
    icon: Sun,
  },
];

export default function SettingsAppearancePage() {
  const { theme, setTheme } = useTheme();
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  const handlePick = (next: Theme) => {
    if (next === theme) return;
    // Apply visually right away — the provider updates the <html> class.
    setTheme(next);
    // Best-effort DB sync so the choice follows the user across devices
    // once the cross-device read path lands (currently DB-write only).
    startTransition(async () => {
      try {
        await updateThemeAction(next);
      } catch {
        // Don't roll back the visual — localStorage still has the new value.
        toast.error('Could not save theme preference', 'Saved locally only.');
      }
    });
  };

  return (
    <div className="px-8 py-10 max-w-2xl">
      <BackLink fallbackHref="/settings" label="Back to Settings" className="mb-6" />
      <div className="flex items-center gap-3 mb-2">
        <Sun size={24} className="text-primary" />
        <h1 className="text-h2">Appearance</h1>
      </div>
      <p className="text-muted-foreground text-body-regular mb-8">
        Choose how Watchly looks. Your choice is remembered on this device
        and saved to your account.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {OPTIONS.map((opt) => {
          const isActive = theme === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => handlePick(opt.value)}
              disabled={pending}
              aria-pressed={isActive}
              className={cn(
                'relative flex flex-col items-start gap-3 p-4 rounded-lg border transition-colors text-left cursor-pointer',
                isActive
                  ? 'border-primary bg-primary/10'
                  : 'border-border hover:border-foreground/40 hover:bg-card/60',
                pending && 'opacity-70',
              )}
            >
              <div className="flex items-center justify-between w-full">
                <opt.icon
                  size={20}
                  className={cn(
                    'transition-colors',
                    isActive ? 'text-primary' : 'text-muted-foreground',
                  )}
                />
                {isActive && <Check size={14} className="text-primary" />}
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-semibold text-foreground">
                  {opt.label}
                </span>
                <span className="text-xs text-muted-foreground">
                  {opt.description}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mt-10 mb-3">
        Profile
      </h2>
      <BannerToggle />
    </div>
  );
}
