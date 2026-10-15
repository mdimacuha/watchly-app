'use client';

import { useState, useTransition } from 'react';
import { Camera, Check } from 'lucide-react';
import Image from 'next/image';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UserAvatar } from '@/components/ui/user-avatar';
import { useToast } from '@/hooks/useToast';
import { AvatarUpload } from './AvatarUpload';
import { cn } from '@/lib/cn';
import { ACCENTS, type AccentSlug } from '@/constants/accentColors';

interface ProfileEditValues {
  displayName: string;
  bio: string;
  avatarUrl: string;
  accentColor: AccentSlug | null;
}

interface ProfileEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  initial: ProfileEditValues & { firstName: string; lastName: string };
  onSubmit: (values: ProfileEditValues) => Promise<void>;
}

export function ProfileEditModal({
  isOpen,
  onClose,
  initial,
  onSubmit,
}: ProfileEditModalProps) {
  const [displayName, setDisplayName] = useState(initial.displayName);
  const [bio, setBio] = useState(initial.bio);
  const [avatarUrl, setAvatarUrl] = useState(initial.avatarUrl);
  const [accentColor, setAccentColor] = useState<AccentSlug | null>(
    initial.accentColor,
  );
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = displayName.trim();
    if (!trimmed) return;

    startTransition(async () => {
      try {
        await onSubmit({
          displayName: trimmed,
          bio: bio.trim(),
          avatarUrl,
          accentColor,
        });
        onClose();
      } catch (err) {
        toast.error(
          'Could not save',
          err instanceof Error ? err.message : 'Please try again.',
        );
      }
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-md">
      <form onSubmit={handleSave} className="flex flex-col gap-5 p-6">
        <h2 className="text-lg font-semibold pr-8">Edit profile</h2>

        <div className="flex items-center gap-4">
          <div className="relative h-20 w-20 shrink-0">
            {avatarUrl ? (
              <Image
                src={avatarUrl}
                alt="Avatar preview"
                width={80}
                height={80}
                className="h-20 w-20 rounded-full object-cover"
              />
            ) : (
              <UserAvatar
                firstName={initial.firstName}
                lastName={initial.lastName}
                size="lg"
                className="!w-20 !h-20 text-2xl"
              />
            )}
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Camera className="w-3.5 h-3.5" />
              PNG / JPG · up to 4MB
            </span>
            <AvatarUpload
              onUploaded={(url) => {
                setAvatarUrl(url);
                toast.success('Avatar ready', 'Click Save to apply.');
              }}
              onError={(message) => {
                toast.error('Upload failed', message);
              }}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="profile-name" className="text-sm font-medium">
            Display name
          </label>
          <Input
            id="profile-name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="How others will see you"
            maxLength={50}
            required
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="profile-bio" className="text-sm font-medium">
            Bio <span className="text-muted-foreground">(optional)</span>
          </label>
          <textarea
            id="profile-bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="A short blurb about yourself"
            maxLength={160}
            rows={3}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
          />
          <span className="text-xs text-muted-foreground text-right">
            {bio.length}/160
          </span>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium">Accent color</label>
          <div className="flex flex-wrap gap-2 items-center">
            {/* Default = no accent override (uses Watchly blue tokens). */}
            <SwatchButton
              label="Default"
              isActive={accentColor === null}
              onClick={() => setAccentColor(null)}
              // Stripe-style "no choice" affordance: muted ring around an empty
              // circle. Distinct from any color in the palette.
              style={{
                backgroundColor: 'transparent',
                borderColor: 'var(--border)',
              }}
            />
            {Object.values(ACCENTS).map((accent) => (
              <SwatchButton
                key={accent.slug}
                label={accent.name}
                isActive={accentColor === accent.slug}
                onClick={() => setAccentColor(accent.slug)}
                style={{ backgroundColor: accent.primary, borderColor: accent.primary }}
              />
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending || !displayName.trim()}>
            {pending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

interface SwatchButtonProps {
  label: string;
  isActive: boolean;
  onClick: () => void;
  style: React.CSSProperties;
}

function SwatchButton({ label, isActive, onClick, style }: SwatchButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={isActive}
      className={cn(
        'relative w-8 h-8 rounded-full border-2 transition-transform cursor-pointer hover:scale-110',
        isActive && 'ring-2 ring-offset-2 ring-offset-card ring-foreground',
      )}
      style={style}
    >
      {isActive && (
        <Check className="w-4 h-4 text-white drop-shadow absolute inset-0 m-auto" />
      )}
    </button>
  );
}
