'use client';

import { useState, useTransition } from 'react';
import { Camera, Check, Trash2 } from 'lucide-react';
import Image from 'next/image';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UserAvatar } from '@/components/ui/user-avatar';
import { useToast } from '@/hooks/useToast';
import { AvatarUpload } from './AvatarUpload';
import { AccentScope } from './AccentScope';
import { cn } from '@/lib/cn';
import { ACCENTS, type AccentSlug } from '@/constants/accentColors';
import {
  CARD_FEATURE_LABELS,
  CARD_FEATURE_LABEL_SLUGS,
  type CardFeatureLabel,
  type CardFeatureMode,
  type CardFeatureSetting,
} from '@/constants/cardFeature';
import { buildImageUrl } from '@/lib/tmdb';

interface ProfileEditValues {
  displayName: string;
  bio: string;
  avatarUrl: string;
  accentColor: AccentSlug | null;
  /** Only sent when the editor shows the Card highlight section. */
  cardFeature?: CardFeatureSetting;
}

/** A favorite the highlight can be set to. */
export interface HighlightOption {
  mediaType: 'movie' | 'tv';
  tmdbId: number;
  title: string;
  posterPath: string | null;
}

interface ProfileEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  initial: ProfileEditValues & { firstName: string; lastName: string; username?: string };
  onSubmit: (values: ProfileEditValues) => Promise<void>;
  /**
   * Enables the "Card highlight" section (profile redesign): the current
   * setting + the favorites a custom highlight can be picked from.
   */
  cardFeature?: { initial: CardFeatureSetting; favorites: HighlightOption[] };
}

const NAME_MAX = 50;
const BIO_MAX = 160;
// The default accent (no override) previews as Watchly blue.
const DEFAULT_SWATCH = ACCENTS.blue.primary;

/**
 * Edit profile: a live preview of the profile card on one side, the form on
 * the other. The whole modal adopts the accent being picked, so the preview,
 * focus rings and Save button recolor as you choose.
 */
export function ProfileEditModal({ isOpen, onClose, initial, onSubmit, cardFeature }: ProfileEditModalProps) {
  const [displayName, setDisplayName] = useState(initial.displayName);
  const [bio, setBio] = useState(initial.bio);
  const [avatarUrl, setAvatarUrl] = useState(initial.avatarUrl);
  const [accentColor, setAccentColor] = useState<AccentSlug | null>(initial.accentColor);
  const [highlightMode, setHighlightMode] = useState<CardFeatureMode>(cardFeature?.initial.mode ?? 'now_showing');
  const [highlightPick, setHighlightPick] = useState<string | null>(
    cardFeature?.initial.mediaType && cardFeature.initial.mediaId
      ? `${cardFeature.initial.mediaType}:${cardFeature.initial.mediaId}`
      : null,
  );
  const [highlightLabel, setHighlightLabel] = useState<CardFeatureLabel>(cardFeature?.initial.label ?? 'die_for');
  const pickedTitle = cardFeature?.favorites.find((f) => `${f.mediaType}:${f.tmdbId}` === highlightPick) ?? null;
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = displayName.trim();
    if (!trimmed) return;
    if (cardFeature && highlightMode === 'custom' && !pickedTitle) {
      toast.error('Pick a favorite', 'Choose which favorite to feature on your card.');
      return;
    }

    startTransition(async () => {
      try {
        await onSubmit({
          displayName: trimmed,
          bio: bio.trim(),
          avatarUrl,
          accentColor,
          ...(cardFeature && {
            cardFeature:
              highlightMode === 'custom' && pickedTitle
                ? { mode: 'custom', mediaType: pickedTitle.mediaType, mediaId: String(pickedTitle.tmdbId), label: highlightLabel }
                : { mode: highlightMode, mediaType: null, mediaId: null, label: null },
          }),
        });
        onClose();
      } catch (err) {
        toast.error('Could not save', err instanceof Error ? err.message : 'Please try again.');
      }
    });
  };

  const accentName = accentColor ? ACCENTS[accentColor].name : 'Default';

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-3xl">
      <AccentScope accentColor={accentColor}>
        <form onSubmit={handleSave} className="flex flex-col">
          <header className="border-b border-border px-6 pt-6 pb-4">
            <h2 className="text-lg font-semibold pr-8">Edit profile</h2>
            <p className="text-sm text-muted-foreground">Changes preview live — this is how others see your card.</p>
          </header>

          <div className="grid gap-6 p-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            {/* Live preview */}
            <section aria-label="Preview" className="flex flex-col gap-2">
              <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Preview</span>
              <div className="rounded-2xl bg-linear-to-br from-primary via-primary/30 to-border p-px">
                <div className="relative overflow-hidden rounded-2xl bg-card p-5">
                  <div aria-hidden className="pointer-events-none absolute inset-0 bg-linear-to-br from-primary/15 via-transparent to-transparent" />
                  <div className="relative flex flex-col gap-3">
                    <AvatarPreview avatarUrl={avatarUrl} firstName={initial.firstName} lastName={initial.lastName} size={64} />
                    <div className="min-w-0">
                      <p className="truncate text-xl font-bold leading-tight">{displayName.trim() || 'Your name'}</p>
                      {initial.username && <p className="text-sm text-muted-foreground">@{initial.username}</p>}
                    </div>
                    <p className={cn('text-sm', bio.trim() ? 'text-foreground/90' : 'italic text-muted-foreground')}>
                      {bio.trim() || 'No bio yet'}
                    </p>
                    <span className="h-1 w-12 rounded-full bg-primary" />
                    {cardFeature && (
                      <div className="flex items-center gap-3 border-t border-dashed border-border pt-3">
                        {highlightMode === 'custom' && pickedTitle?.posterPath && (
                          <Image
                            src={buildImageUrl(pickedTitle.posterPath, 'w92')!}
                            alt=""
                            width={32}
                            height={48}
                            className="h-12 w-8 rounded object-cover"
                          />
                        )}
                        <div className="min-w-0">
                          <p className="text-[10px] font-semibold uppercase tracking-widest text-primary">
                            {highlightMode === 'custom'
                              ? CARD_FEATURE_LABELS[highlightLabel]
                              : highlightMode === 'top_pick'
                                ? 'Their #1'
                                : 'Now showing'}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {highlightMode === 'custom'
                              ? pickedTitle?.title ?? 'Pick a favorite'
                              : highlightMode === 'top_pick'
                                ? 'Your highest-rated favorite'
                                : "What you're watching now"}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </section>

            {/* Form */}
            <div className="flex flex-col gap-5">
              <div className="flex items-center gap-4">
                <div className="relative shrink-0">
                  <AvatarPreview avatarUrl={avatarUrl} firstName={initial.firstName} lastName={initial.lastName} size={72} />
                  <span className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-card bg-primary text-primary-foreground">
                    <Camera className="h-3.5 w-3.5" />
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <AvatarUpload
                      onUploaded={(url) => {
                        setAvatarUrl(url);
                        toast.success('Photo ready', 'Click Save to apply.');
                      }}
                      onError={(message) => toast.error('Upload failed', message)}
                    />
                    {avatarUrl && (
                      <button
                        type="button"
                        onClick={() => setAvatarUrl('')}
                        className="inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-sm text-muted-foreground hover:bg-foreground/5 hover:text-destructive cursor-pointer"
                      >
                        <Trash2 className="h-4 w-4" /> Remove
                      </button>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">PNG or JPG, up to 4MB</span>
                </div>
              </div>

              <Field label="Display name" htmlFor="profile-name" count={`${displayName.length}/${NAME_MAX}`}>
                <Input
                  id="profile-name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="How others will see you"
                  maxLength={NAME_MAX}
                  required
                />
              </Field>

              <Field label="Bio" hint="optional" htmlFor="profile-bio" count={`${bio.length}/${BIO_MAX}`}>
                <textarea
                  id="profile-bio"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="What do you love to watch?"
                  maxLength={BIO_MAX}
                  rows={3}
                  className="resize-none rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </Field>

              <div className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-medium" id="accent-label">Accent color</span>
                  <span className="text-xs text-muted-foreground">{accentName}</span>
                </div>
                <div role="radiogroup" aria-labelledby="accent-label" className="flex flex-wrap gap-2">
                  <Swatch label="Default" color={DEFAULT_SWATCH} isActive={accentColor === null} onClick={() => setAccentColor(null)} />
                  {Object.values(ACCENTS).map((accent) => (
                    <Swatch
                      key={accent.slug}
                      label={accent.name}
                      color={accent.primary}
                      isActive={accentColor === accent.slug}
                      onClick={() => setAccentColor(accent.slug)}
                    />
                  ))}
                </div>
              </div>

              {cardFeature && (
                <div className="flex flex-col gap-2">
                  <span className="text-sm font-medium" id="highlight-label">Card highlight</span>
                  <div role="radiogroup" aria-labelledby="highlight-label" className="flex w-fit flex-wrap gap-1 rounded-lg bg-secondary p-1">
                    {(
                      [
                        ['now_showing', 'Now showing'],
                        ['top_pick', 'Their #1'],
                        ['custom', 'Pick a favorite'],
                      ] as const
                    ).map(([mode, text]) => (
                      <button
                        key={mode}
                        type="button"
                        role="radio"
                        aria-checked={highlightMode === mode}
                        onClick={() => setHighlightMode(mode)}
                        className={cn(
                          'rounded-md px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer',
                          highlightMode === mode ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                        )}
                      >
                        {text}
                      </button>
                    ))}
                  </div>

                  {highlightMode === 'custom' &&
                    (cardFeature.favorites.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Favorite a few titles first — then you can feature one here.</p>
                    ) : (
                      <>
                        <div role="radiogroup" aria-label="Favorite to feature" className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 py-1">
                          {cardFeature.favorites.map((f) => {
                            const key = `${f.mediaType}:${f.tmdbId}`;
                            const active = highlightPick === key;
                            return (
                              <button
                                key={key}
                                type="button"
                                role="radio"
                                aria-checked={active}
                                aria-label={f.title}
                                title={f.title}
                                onClick={() => setHighlightPick(key)}
                                className={cn(
                                  'relative h-24 w-16 shrink-0 overflow-hidden rounded-md bg-muted transition cursor-pointer',
                                  active ? 'ring-2 ring-primary ring-offset-2 ring-offset-card' : 'opacity-70 hover:opacity-100',
                                )}
                              >
                                {f.posterPath && (
                                  <Image src={buildImageUrl(f.posterPath, 'w154')!} alt="" fill sizes="64px" className="object-cover" />
                                )}
                                {active && <Check className="absolute right-1 top-1 h-4 w-4 rounded-full bg-primary p-0.5 text-primary-foreground" />}
                              </button>
                            );
                          })}
                        </div>
                        <div role="radiogroup" aria-label="Label" className="flex flex-wrap gap-1.5">
                          {CARD_FEATURE_LABEL_SLUGS.map((slug) => (
                            <button
                              key={slug}
                              type="button"
                              role="radio"
                              aria-checked={highlightLabel === slug}
                              onClick={() => setHighlightLabel(slug)}
                              className={cn(
                                'rounded-full border px-2.5 py-1 text-xs transition-colors cursor-pointer',
                                highlightLabel === slug
                                  ? 'border-primary bg-primary/15 text-foreground'
                                  : 'border-border text-muted-foreground hover:text-foreground',
                              )}
                            >
                              {CARD_FEATURE_LABELS[slug]}
                            </button>
                          ))}
                        </div>
                      </>
                    ))}
                </div>
              )}
            </div>
          </div>

          <footer className="flex justify-end gap-2 border-t border-border px-6 py-4">
            <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !displayName.trim()}>
              {pending ? 'Saving…' : 'Save changes'}
            </Button>
          </footer>
        </form>
      </AccentScope>
    </Modal>
  );
}

function AvatarPreview({
  avatarUrl,
  firstName,
  lastName,
  size,
}: {
  avatarUrl: string;
  firstName: string;
  lastName: string;
  size: number;
}) {
  return avatarUrl ? (
    <Image
      src={avatarUrl}
      alt="Avatar preview"
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className="rounded-full object-cover"
    />
  ) : (
    <UserAvatar
      firstName={firstName}
      lastName={lastName}
      size="lg"
      className={cn('text-xl', size >= 72 ? '!h-18 !w-18' : '!h-16 !w-16')}
    />
  );
}

function Field({
  label,
  hint,
  htmlFor,
  count,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor: string;
  count: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <label htmlFor={htmlFor} className="text-sm font-medium">
          {label} {hint && <span className="font-normal text-muted-foreground">({hint})</span>}
        </label>
        <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
      </div>
      {children}
    </div>
  );
}

function Swatch({
  label,
  color,
  isActive,
  onClick,
}: {
  label: string;
  color: string;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={isActive}
      aria-label={label}
      title={label}
      onClick={onClick}
      // Swatch colours are the accent palette's own data values.
      style={{ backgroundColor: color }}
      className={cn(
        'relative h-8 w-8 rounded-full transition-transform cursor-pointer hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card',
        isActive && 'ring-2 ring-foreground ring-offset-2 ring-offset-card',
      )}
    >
      {isActive && <Check className="absolute inset-0 m-auto h-4 w-4 text-white drop-shadow" />}
    </button>
  );
}
