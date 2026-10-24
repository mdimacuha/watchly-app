'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Download,
  Eye,
  Globe,
  Info,
  Lock,
  LogOut,
  Monitor,
  Smartphone,
  Trash2,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { useRegionStore } from '@/client/stores/region';
import { UserAvatar } from '@/components/ui/user-avatar';
import { ConfirmDestructiveModal } from '@/components/ui/ConfirmDestructiveModal';
import { RegionSelector } from '@/components/region/RegionSelector';
import { PreferencesPicker } from '@/components/forYou/PreferencesPicker';
import { AccountSettingsClient } from '@/components/settings/AccountSettingsClient';
import { NotificationPrefsForm } from '@/components/notifications/NotificationPrefsForm';
import { TitleAlertsList } from '@/components/notifications/TitleAlertsList';
import { formatRelativeAgo } from '@/lib/format';
import type { PrivacyLevel } from '@/services/profile/visibility';
import type { PreviewRole } from '@/services/profile/visitorPreview';
import type { SettingsState } from './useSettings';
import { SidebarControls } from './SidebarControls';

// The Settings sections, written once and arranged differently by each
// layout (A ledger, B visitor's view, C two-pane). Every control says, in a
// plain sentence, what it changes.

const dateShort = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

export function Kicker({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('type-kicker text-muted-foreground', className)}>{children}</p>;
}

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

const LEVELS: { value: PrivacyLevel; label: string; icon: typeof Globe }[] = [
  { value: 'public', label: 'Anyone', icon: Globe },
  { value: 'followers_only', label: 'Followers', icon: Users },
  { value: 'private', label: 'Only me', icon: Lock },
];

/** Who-can-see picker: three choices, and one sentence for the one picked. */
export function LevelPicker({
  label,
  value,
  onChange,
  sentences,
}: {
  label: string;
  value: PrivacyLevel;
  onChange: (next: PrivacyLevel) => void;
  sentences: Record<PrivacyLevel, string>;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-semibold text-foreground">{label}</legend>
      <div role="radiogroup" aria-label={label} className="grid grid-cols-3 gap-1 rounded-md bg-secondary p-1">
        {LEVELS.map((l) => {
          const active = value === l.value;
          return (
            <button
              key={l.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => !active && onChange(l.value)}
              className={cn(
                'flex items-center justify-center gap-1.5 rounded-sm px-2 py-2 text-sm font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <l.icon className={cn('h-3.5 w-3.5', active && 'text-primary')} />
              {l.label}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">{sentences[value]}</p>
    </fieldset>
  );
}

/** One on/off setting with the sentence that says what "on" means. */
export function SwitchRow({
  label,
  sentence,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  sentence: ReactNode;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">{label}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{sentence}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative mt-0.5 h-6 w-10 shrink-0 rounded-full transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
          // Off needs a visible track, not just the knob on the page colour.
          checked ? 'bg-primary' : 'bg-muted-foreground/35',
        )}
      >
        <span className={cn('absolute left-1 top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform', checked && 'translate-x-4')} />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Privacy
// ---------------------------------------------------------------------------

export function PrivacyControls({ s }: { s: SettingsState }) {
  const p = s.privacy;
  return (
    <div className="flex flex-col gap-6">
      <LevelPicker
        label="Who can open my profile"
        value={p.profileVisibility}
        onChange={(v) => s.updatePrivacy({ profileVisibility: v })}
        sentences={{
          public: 'Anyone can open your profile.',
          followers_only: "Only people you've accepted can open it. Others see your name and a Follow button.",
          private: 'Only you. Everyone else, followers included, sees a locked profile.',
        }}
      />
      <LevelPicker
        label="Who can see my watchlists"
        value={p.watchlistsVisibility}
        onChange={(v) => s.updatePrivacy({ watchlistsVisibility: v })}
        sentences={{
          public: "Lists you mark public show on your profile. Anyone with a public list's link can open it.",
          followers_only: "Lists you mark public show on your profile to accepted followers only. A public list's link still opens for anyone who has it.",
          private: 'No lists show on your profile. A list you mark public can still be opened by anyone with its link.',
        }}
      />
      <div className="divide-y divide-border border-y border-border">
        <SwitchRow
          label="Show my favorites"
          sentence="All your favorites, on your profile's Library. Public shelves show either way."
          checked={!p.hideFavorites}
          onChange={(on) => s.updatePrivacy({ hideFavorites: !on })}
        />
        <SwitchRow
          label="Show what I've watched"
          sentence="Your watched titles as ticket stubs in your Library. Off by default."
          checked={!p.hideWatched}
          onChange={(on) => s.updatePrivacy({ hideWatched: !on })}
        />
        <SwitchRow
          label="Show my likes"
          sentence="Titles you liked in Watchly Swipe and For You, in a Likes tab on your profile. Off by default."
          checked={!p.hideLikes}
          onChange={(on) => s.updatePrivacy({ hideLikes: !on })}
        />
      </div>
      <ShelfToggles s={s} />
    </div>
  );
}

export function ShelfToggles({ s }: { s: SettingsState }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-sm font-semibold text-foreground">Shelves on my profile</p>
      <p className="text-xs text-muted-foreground">Each shelf is private until you show it. Shown shelves appear even when favorites are hidden.</p>
      {s.shelves.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          No shelves yet. Make one on{' '}
          <Link href="/favorites" className="text-foreground underline underline-offset-4">Favorites</Link>.
        </p>
      ) : (
        <ul className="mt-1 divide-y divide-border">
          {s.shelves.map((shelf) => (
            <li key={shelf.id}>
              <SwitchRow
                label={shelf.name}
                sentence={`${shelf.count} ${shelf.count === 1 ? 'title' : 'titles'} · ${shelf.isPublic ? 'shown on your profile' : 'private'}`}
                checked={shelf.isPublic}
                onChange={(on) => s.setShelfPublic(shelf.id, on)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * What a stranger or a follower sees, from the server (the public profile's
 * own rules). Announces changes politely for screen readers.
 */
export function VisitorCard({ s, className }: { s: SettingsState; className?: string }) {
  const [role, setRole] = useState<PreviewRole>('stranger');
  const view = s.preview.views[role];
  const o = s.preview.owner;
  return (
    <section aria-label="What visitors see" className={cn('rounded-lg border border-border bg-card', className)}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-border px-4 py-3">
        <Kicker>What visitors see</Kicker>
        <div role="radiogroup" aria-label="Visitor" className="flex gap-1 rounded-md bg-secondary p-0.5 text-xs">
          {(['stranger', 'follower'] as const).map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={role === r}
              onClick={() => setRole(r)}
              className={cn(
                'whitespace-nowrap rounded-sm px-2 py-1 font-medium cursor-pointer',
                role === r ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {r === 'stranger' ? 'Stranger' : 'Follower'}
            </button>
          ))}
        </div>
      </div>

      <div className={cn('flex flex-col gap-4 p-4 transition-opacity', s.previewLoading && 'opacity-60')} aria-live="polite" aria-busy={s.previewLoading}>
        <div className="flex items-center gap-3">
          <UserAvatar avatarUrl={o.avatarUrl} firstName={o.firstName} lastName={o.lastName} size="md" />
          <div className="min-w-0">
            <p className="truncate font-semibold text-foreground">{o.displayName}</p>
            <p className="text-xs text-muted-foreground">@{o.username}</p>
          </div>
          {!view.opens && (
            <span className="ml-auto inline-flex items-center gap-1 rounded-sm border border-border px-2 py-1 text-xs text-muted-foreground">
              <Lock className="h-3 w-3" /> Locked
            </span>
          )}
        </div>

        {view.opens && (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {view.areas.map((a) => (
              <li
                key={a.key}
                className={cn(
                  'rounded-md border px-3 py-2',
                  a.visible ? 'border-border bg-background/40' : 'border-dashed border-border/70 text-muted-foreground',
                )}
              >
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{a.label}</p>
                <p className={cn('mt-0.5 text-sm font-semibold', a.visible ? 'text-foreground' : 'text-muted-foreground')}>
                  {a.visible ? `${a.count} shown` : 'Hidden'}
                </p>
              </li>
            ))}
          </ul>
        )}

        {view.notes.length > 0 && (
          <ul className="flex flex-col gap-1.5">
            {view.notes.map((n) => (
              <li key={n.text} className={cn('flex items-start gap-2 text-xs', n.tone === 'warning' ? 'text-foreground' : 'text-muted-foreground')}>
                {n.tone === 'warning' ? (
                  <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0 text-primary" aria-label="Heads up" />
                ) : (
                  <Info className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
                )}
                <span>{n.text}</span>
              </li>
            ))}
          </ul>
        )}

        {role === 'stranger' && (
          <Link href="/me?as=visitor" className="inline-flex w-fit items-center gap-1.5 text-xs font-medium text-foreground underline-offset-4 hover:underline">
            <Eye className="h-3.5 w-3.5" /> Open my profile as a stranger
          </Link>
        )}
      </div>
    </section>
  );
}

export function BlockedList({ s }: { s: SettingsState }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-sm font-semibold text-foreground">Blocked people</p>
      <p className="text-xs text-muted-foreground">They can&apos;t open your profile or follow you, and you won&apos;t see each other.</p>
      {s.blocked.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">You haven&apos;t blocked anyone. Block someone from the ⋯ menu on their profile.</p>
      ) : (
        <ul className="mt-1 divide-y divide-border">
          {s.blocked.map((b) => (
            <li key={b.id} className="flex items-center gap-3 py-2.5">
              <UserAvatar avatarUrl={b.avatarUrl} firstName={b.firstName} lastName={b.lastName} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{b.displayName}</p>
                <p className="text-xs text-muted-foreground">@{b.username} · blocked {dateShort(b.blockedAt)}</p>
              </div>
              <button
                type="button"
                onClick={() => s.unblock(b.id)}
                className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-secondary cursor-pointer"
              >
                Unblock
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export function NotificationsControls({ s }: { s: SettingsState }) {
  return (
    <div className="flex flex-col gap-8">
      <NotificationPrefsForm initial={s.snapshot.notifications} />
      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold text-foreground">Title alerts</p>
        <p className="text-xs text-muted-foreground">
          &ldquo;Notify me when&rdquo; alerts you set on titles, checked daily. Turn off &ldquo;Title alerts&rdquo; above to mute them all.
        </p>
        <TitleAlertsList initial={s.snapshot.alerts} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Account & devices
// ---------------------------------------------------------------------------

export function AccountControls({ s }: { s: SettingsState }) {
  const a = s.snapshot.account;
  return (
    <div className="flex flex-col gap-6">
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">Username</dt>
          <dd className="font-medium text-foreground">@{a.username}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Member since</dt>
          <dd className="font-medium text-foreground">{dateShort(a.memberSince)}</dd>
        </div>
      </dl>
      <AccountSettingsClient currentEmail={a.email} />
    </div>
  );
}

export function SessionsList({ s }: { s: SettingsState }) {
  const [confirm, setConfirm] = useState(false);
  const others = s.sessions.filter((x) => !x.current).length;
  return (
    <div className="flex flex-col gap-1">
      <p className="text-sm font-semibold text-foreground">Signed-in devices</p>
      <p className="text-xs text-muted-foreground">If you don&apos;t recognise one, sign it out and change your password.</p>
      <ul className="mt-1 divide-y divide-border">
        {s.sessions.map((x) => {
          const Icon = /iPhone|iPad|Android/.test(x.device) ? Smartphone : Monitor;
          return (
            <li key={x.id} className="flex items-center gap-3 py-2.5">
              <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {x.device}
                  {x.current && <span className="ml-2 rounded-sm bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">This device</span>}
                </p>
                <p className="text-xs text-muted-foreground">Signed in {formatRelativeAgo(x.signedInAt)}</p>
              </div>
              {!x.current && (
                <button
                  type="button"
                  onClick={() => s.signOutSession(x.id)}
                  className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-secondary cursor-pointer"
                >
                  Sign out
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {others > 0 && (
        <button
          type="button"
          onClick={() => setConfirm(true)}
          className="mt-2 inline-flex w-fit items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-secondary cursor-pointer"
        >
          <LogOut className="h-4 w-4" /> Sign out everywhere else
        </button>
      )}
      <p className="mt-1 text-[11px] text-muted-foreground">Devices that signed in before this list existed show as &ldquo;Unknown device&rdquo;.</p>
      <ConfirmDestructiveModal
        isOpen={confirm}
        onClose={() => setConfirm(false)}
        title="Sign out everywhere else?"
        description={`This signs out ${others} other ${others === 1 ? 'device' : 'devices'}. This device stays signed in.`}
        confirmLabel="Sign out others"
        icon={LogOut}
        onConfirm={async () => {
          setConfirm(false);
          await s.signOutOthers();
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Watching: region + services
// ---------------------------------------------------------------------------

export function RegionControl() {
  const { regionCode, regionName, setRegion } = useRegionStore();
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">Region</p>
          <p className="text-xs text-muted-foreground">
            {regionName || regionCode || 'Not set'} · decides which services and prices you see.
          </p>
        </div>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-secondary cursor-pointer"
        >
          {open ? 'Done' : 'Change'}
        </button>
      </div>
      {open && (
        <RegionSelector
          selectedRegion={regionCode}
          onSelect={(code, name) => {
            setRegion(code, name);
            setOpen(false);
          }}
          className="h-[360px]"
        />
      )}
    </div>
  );
}

export function ServicesControl({ s }: { s: SettingsState }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-semibold text-foreground">My streaming services</p>
      <p className="text-xs text-muted-foreground">Tonight&apos;s Programme only recommends what&apos;s on these. Pick none to see everything in your region.</p>
      <PreferencesPicker initialSelected={s.snapshot.forYou.selectedProviders} catalog={s.snapshot.forYou.catalog} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

export function DataControls() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">Download my data</p>
          <p className="text-xs text-muted-foreground">
            A JSON file of your lists, favorites, shelves, watched titles, reviews, follows and alerts.
          </p>
        </div>
        <a
          href="/api/me/export"
          download
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-secondary"
        >
          <Download className="h-4 w-4" /> Download
        </a>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-destructive">Delete my account</p>
          <p className="text-xs text-muted-foreground">You&apos;ll have a grace period to change your mind before it&apos;s gone.</p>
        </div>
        <Link
          href="/settings/delete"
          className="inline-flex items-center gap-1.5 rounded-md border border-destructive/50 px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="h-4 w-4" /> Delete…
        </Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section registry: grouped by the question people arrive with
// ---------------------------------------------------------------------------

export type SectionId = 'privacy' | 'notifications' | 'account' | 'watching' | 'sidebar' | 'data';

export const SECTIONS: { id: SectionId; title: string; question: string }[] = [
  { id: 'privacy', title: 'Privacy', question: 'Who can see my stuff?' },
  { id: 'notifications', title: 'Notifications', question: 'What will Watchly ping me about?' },
  { id: 'account', title: 'Account & devices', question: 'Is my account safe?' },
  { id: 'watching', title: 'Region & services', question: 'Where and what do I watch?' },
  { id: 'sidebar', title: 'Sidebar', question: 'What does my sidebar show, and where?' },
  { id: 'data', title: 'Your data', question: 'Can I take my data, or leave?' },
];

/** The body of a section (without its heading). */
export function SectionBody({ id, s, withPreview = true }: { id: SectionId; s: SettingsState; withPreview?: boolean }) {
  switch (id) {
    case 'privacy':
      return (
        <div className="flex flex-col gap-8">
          {withPreview && <VisitorCard s={s} />}
          <PrivacyControls s={s} />
          <BlockedList s={s} />
        </div>
      );
    case 'notifications':
      return <NotificationsControls s={s} />;
    case 'account':
      return (
        <div className="flex flex-col gap-8">
          <AccountControls s={s} />
          <SessionsList s={s} />
        </div>
      );
    case 'watching':
      return (
        <div className="flex flex-col gap-8">
          <RegionControl />
          <ServicesControl s={s} />
        </div>
      );
    case 'sidebar':
      return <SidebarControls />;
    case 'data':
      return <DataControls />;
  }
}
