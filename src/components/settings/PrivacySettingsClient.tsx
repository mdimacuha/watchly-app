'use client';

import { useState, useTransition } from 'react';
import { Globe, Users as UsersIcon, Lock } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/useToast';
import { updatePrivacyAction } from '@/actions/settings';

type Visibility = 'public' | 'followers_only' | 'private';

interface PrivacySettingsClientProps {
  initial: {
    profileVisibility: Visibility;
    watchlistsVisibility: Visibility;
    hideFavorites: boolean;
    hideWatched: boolean;
  };
}

const VISIBILITY_OPTIONS: Array<{ value: Visibility; label: string; hint: string; icon: React.ComponentType<{ className?: string }> }> = [
  { value: 'public', label: 'Public', hint: 'Anyone can see this', icon: Globe },
  { value: 'followers_only', label: 'Followers only', hint: 'Only your followers (when social ships)', icon: UsersIcon },
  { value: 'private', label: 'Private', hint: 'Only you', icon: Lock },
];

export function PrivacySettingsClient({ initial }: PrivacySettingsClientProps) {
  const [profile, setProfile] = useState<Visibility>(initial.profileVisibility);
  const [lists, setLists] = useState<Visibility>(initial.watchlistsVisibility);
  const [hideFavs, setHideFavs] = useState(initial.hideFavorites);
  const [hideWatched, setHideWatched] = useState(initial.hideWatched);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  const save = (patch: Partial<{
    profileVisibility: Visibility;
    watchlistsVisibility: Visibility;
    hideFavorites: boolean;
    hideWatched: boolean;
  }>) => {
    startTransition(async () => {
      try {
        await updatePrivacyAction(patch);
      } catch (err) {
        toast.error(
          'Could not save',
          err instanceof Error ? err.message : 'Please try again.',
        );
      }
    });
  };

  return (
    <div className="flex flex-col gap-6 max-w-xl">
      <Row
        label="Profile visibility"
        description="Who can view your public profile page."
      >
        <Select
          value={profile}
          onValueChange={(v) => {
            const next = v as Visibility;
            setProfile(next);
            save({ profileVisibility: next });
          }}
        >
          <SelectTrigger className="w-[200px]" disabled={pending}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {VISIBILITY_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Row>

      <Row
        label="Watchlists default"
        description="Default visibility for new watchlists. Per-list toggle still applies."
      >
        <Select
          value={lists}
          onValueChange={(v) => {
            const next = v as Visibility;
            setLists(next);
            save({ watchlistsVisibility: next });
          }}
        >
          <SelectTrigger className="w-[200px]" disabled={pending}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {VISIBILITY_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Row>

      <Row
        label="Hide favorites from my profile"
        description="When on, your favorites won't appear on your public profile."
      >
        <label className="inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={hideFavs}
            onChange={(e) => {
              setHideFavs(e.target.checked);
              save({ hideFavorites: e.target.checked });
            }}
            disabled={pending}
            className="w-4 h-4 accent-primary cursor-pointer"
          />
        </label>
      </Row>

      <Row
        label="Show watched titles on my profile"
        description="Watched titles are hidden by default. Turn on to share what you've finished on your public profile."
      >
        <label className="inline-flex items-center cursor-pointer">
          {/* Stored as hideWatched; this toggle is the inverse so the
              copy reads as a positive opt-in instead of a double
              negative. */}
          <input
            type="checkbox"
            checked={!hideWatched}
            onChange={(e) => {
              const showWatched = e.target.checked;
              setHideWatched(!showWatched);
              save({ hideWatched: !showWatched });
            }}
            disabled={pending}
            className="w-4 h-4 accent-primary cursor-pointer"
          />
        </label>
      </Row>
    </div>
  );
}

function Row({
  label,
  description,
  children,
}: {
  label: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-border/40 last:border-b-0">
      <div className="flex flex-col gap-1 min-w-0">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <span className="text-xs text-muted-foreground max-w-md">
          {description}
        </span>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
