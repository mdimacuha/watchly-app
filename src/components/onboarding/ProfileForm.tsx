'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Camera, ArrowRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UserAvatar } from '@/components/ui/user-avatar';
import { AvatarUpload } from '@/components/profile/AvatarUpload';
import { useToast } from '@/hooks/useToast';
import { PATHS } from '@/lib/app';

interface ProfileFormProps {
  initialDisplayName: string;
  initialBio?: string;
  initialAvatarUrl?: string;
  firstName: string;
  lastName: string;
}

const BIO_MAX = 160;
const DISPLAY_NAME_MAX = 50;

/**
 * Onboarding step 2 — profile setup. Matches the visual language of
 * `ProfileEditModal` (avatar preview on the left, AvatarUpload trigger
 * on the right, design-system labels + inputs) so users see one
 * coherent form between onboarding and settings.
 */
export function ProfileForm({
  initialDisplayName,
  initialBio = '',
  initialAvatarUrl = '',
  firstName,
  lastName,
}: ProfileFormProps) {
  const router = useRouter();
  const toast = useToast();
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [bio, setBio] = useState(initialBio);
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  const [isLoading, setIsLoading] = useState(false);

  const handleContinue = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await fetch('/api/me/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: displayName.trim(),
          bio: bio.trim(),
          avatarUrl,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update profile');
      }

      router.push(PATHS.ONBOARDING.REGION_AUTO);
    } catch {
      setIsLoading(false);
      toast.error('Could not save', 'Please try again.');
    }
  };

  return (
    <form onSubmit={handleContinue} className="flex flex-col gap-6">
      {/* Avatar: preview on the left, upload trigger + hint on the
          right. Mirrors ProfileEditModal so onboarding feels like the
          same product surface, not a one-off. */}
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
              firstName={firstName}
              lastName={lastName}
              size="lg"
              className="!w-20 !h-20 text-2xl"
            />
          )}
        </div>
        <div className="flex flex-col gap-2 flex-1 min-w-0">
          <span className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Camera className="w-3.5 h-3.5" />
            PNG / JPG · up to 8MB
          </span>
          <AvatarUpload
            onUploaded={(url) => {
              setAvatarUrl(url);
              toast.success('Avatar ready', 'Click Continue to save it.');
            }}
            onError={(message) => {
              toast.error('Upload failed', message);
            }}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="onboarding-display-name" className="text-sm font-medium">
          Display name
        </label>
        <Input
          id="onboarding-display-name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="How others will see you"
          maxLength={DISPLAY_NAME_MAX}
          required
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="onboarding-bio" className="text-sm font-medium">
          Bio
        </label>
        <textarea
          id="onboarding-bio"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder="Tell us a bit about yourself…"
          maxLength={BIO_MAX}
          className="min-h-[88px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
        />
        <span className="text-xs text-muted-foreground text-right">
          {bio.length} / {BIO_MAX}
        </span>
      </div>

      <Button
        type="submit"
        disabled={isLoading || !displayName.trim()}
        className="w-full gap-2"
      >
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <>
            Continue
            <ArrowRight size={16} />
          </>
        )}
      </Button>
    </form>
  );
}
