'use client';

/**
 * The profile page (/me and /user/[username]):
 *   - the member card — billing line, stamps, card highlight, actions —
 *     with a subtle 3D tilt + accent gradient, and instant accent swatches
 *   - Feature presentation: crowned #1 + 3 supports, ranked by the owner's
 *     own star ratings, then recency
 *   - Programmes (watchlists, with Quick View)
 *   - By the numbers (bento stat frames)
 * Tabs: Profile · Library · Reviews. Owner: Edit · Accent · Preview as
 * visitor · Share · Export story. Visitors: Follow · Share · Block menu ·
 * taste match.
 */

import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, useMotionTemplate, useMotionValue, useReducedMotion, useSpring, useTransform } from 'framer-motion';
import { ChevronDown, Crown, Eye, Link2, Palette, Pencil, Star, StarHalf, Users } from 'lucide-react';
import { cn } from '@/lib/cn';
import { buildImageUrl } from '@/lib/tmdb';
import { type AccentColor } from '@/constants/accentColors';
import { isVerifiedAccount } from '@/constants/verifiedAccounts';
import { VerifiedBadge } from '@/components/profile/VerifiedBadge';
import { QuickViewLink } from '@/components/watchly/QuickViewLink';
import { UserAvatar } from '@/components/ui/user-avatar';
import { FollowButton } from '@/components/social/FollowButton';
import { ProfileMoreMenu } from '@/components/social/ProfileMoreMenu';
import { WatchlistCoverCard } from '@/components/watchlists/WatchlistCoverCard';
import { FollowSuggestionsRow } from '@/components/social/FollowSuggestionsRow';
import { AccentScope } from '@/components/profile/AccentScope';
import { ProfileEditModal } from '@/components/profile/ProfileEditModal';
import { StoryExportButton } from '@/components/profile/StoryExportButton';
import { ProfileLibrary, favoritesLoad } from '@/components/profile/ProfileLibrary';
import { ProfileLikes } from '@/components/profile/ProfileLikes';
import { prefetch, useCachedLoad } from '@/client/cachedLoad';
import { MutualFollowersModal } from '@/components/profile/MutualFollowersModal';
import { EMPTY_WATCHED_LOCAL, type WatchedLocal } from '@/components/profile/WatchedTickets';
import { AccentPicker } from '@/components/profile/AccentPicker';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/button';
import { FeaturePicker } from '@/components/profile/FeaturePicker';
import { SpoilerText } from '@/components/reviews/SpoilerText';
import { useToast } from '@/hooks/useToast';
import { trackProfile } from '@/client/profileEvents';
import { getProfileReviewsAction, updateProfileAction } from '@/actions/profile';
import { formatRelativeAgo } from '@/lib/format';
import type { ProfileShowcase } from '@/actions/profile';
import type { InsightTitle } from '@/services/profile/insights';
import { billingLine, estDate, memberCardModel, nameOf, rankedFavorites } from '@/components/profile/profileModel';

interface Props {
  showcase: ProfileShowcase;
  /** Owner viewing their own profile as a signed-out guest would. */
  preview: boolean;
}

type Tab = 'profile' | 'library' | 'reviews' | 'likes';

export function MemberProfile({ showcase, preview }: Props) {
  const searchParams = useSearchParams();
  const { overview } = showcase;
  const ownerId = overview.profile.userId;
  const owner = overview.isSelf && !preview;
  // Likes are hidden from visitors unless the owner turns them on.
  const showLikes = owner || !overview.likesHidden;
  // ?tab=reviews | library | favorites | likes (links from notifications) open that tab.
  const tabParam = searchParams.get('tab');
  const [tab, setTab] = useState<Tab>(() =>
    tabParam === 'likes' && showLikes
      ? 'likes'
      : tabParam === 'reviews' ? 'reviews' : tabParam === 'library' || tabParam === 'favorites' ? 'library' : 'profile',
  );
  // Local accent so swatches recolor instantly (saved in the background).
  const [accent, setAccent] = useState<AccentColor | null>(overview.profile.accentColor);
  // Watched tab changes this visit (removals, new dates, loaded pages); held
  // here so they survive tab switches until the next server load agrees.
  const [watchedLocal, setWatchedLocal] = useState<WatchedLocal>(EMPTY_WATCHED_LOCAL);

  useEffect(() => {
    trackProfile(ownerId, 'profile_viewed', undefined, {
      variant: 'round2',
      preview,
      source: searchParams.get('ref') ?? 'direct',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerId, preview]);

  const openTab = (t: Tab) => {
    setTab(t);
    trackProfile(ownerId, 'section_opened', undefined, { section: t });
  };

  // Start a tab's fetch on hover/focus so it's usually loaded by the click.
  const warmTab = (t: Tab) => {
    const username = overview.profile.username;
    const load =
      t === 'reviews' && showcase.insights.reviews.count > 0
        ? reviewsLoad(username, preview)
        : t === 'library'
          ? favoritesLoad(username, preview)
          : null;
    if (load) prefetch<unknown>(load.key, load.fetcher).catch(() => {});
  };

  return (
    <AccentScope accentColor={accent} className="flex flex-col gap-8">
      {preview && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-primary/40 bg-primary/10 px-4 py-2 text-sm">
          <span className="inline-flex items-center gap-2">
            <Eye className="h-4 w-4" /> Previewing your profile as a signed-out visitor sees it.
          </span>
          <Link href="/me" className="font-medium text-primary hover:underline">
            Exit preview
          </Link>
        </div>
      )}

      <MemberCard showcase={showcase} owner={owner} accent={accent} onAccent={setAccent} />
      <MatchStrip showcase={showcase} />
      {owner && <PeopleYouMightKnow suggestions={showcase.followSuggestions} />}

      <nav role="tablist" aria-label="Profile sections" className="flex gap-1 border-b border-border">
        {(['profile', 'library', 'reviews', ...(showLikes ? ['likes'] : [])] as Tab[]).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => openTab(t)}
            onPointerEnter={() => warmTab(t)}
            onFocus={() => warmTab(t)}
            className={cn(
              '-mb-px border-b-2 px-4 py-2.5 text-sm font-medium capitalize transition-colors cursor-pointer',
              tab === t ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t}
            {t === 'reviews' && showcase.insights.reviews.count > 0 && (
              <span className="ml-1.5 text-xs text-muted-foreground">{showcase.insights.reviews.count}</span>
            )}
          </button>
        ))}
      </nav>

      {tab === 'profile' && (
        <div className="flex flex-col gap-10">
          <FeaturePresentation showcase={showcase} owner={owner} />
          <Programmes showcase={showcase} onOpenLibrary={() => openTab('library')} />
          <ByTheNumbers showcase={showcase} />
        </div>
      )}
      {tab === 'library' && (
        <ProfileLibrary
          initialSection={tabParam === 'favorites' ? 'favorites' : undefined}
          showcase={showcase}
          preview={preview}
          watchedLocal={watchedLocal}
          onWatchedLocalChange={setWatchedLocal}
        />
      )}
      {tab === 'reviews' && <Reviews showcase={showcase} preview={preview} />}
      {tab === 'likes' && showLikes && (
        <ProfileLikes username={overview.profile.username} owner={owner} preview={preview} hidden={overview.profile.hideLikes} />
      )}
    </AccentScope>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type Overview = ProfileShowcase['overview'];

function Poster({ t, className, onOpen, sizes = '160px' }: { t: InsightTitle; className: string; onOpen?: () => void; sizes?: string }) {
  const url = buildImageUrl(t.posterPath, 'w342');
  return (
    <QuickViewLink
      mediaType={t.mediaType}
      titleId={t.tmdbId}
      onClick={onOpen}
      className={cn('group relative block overflow-hidden rounded-md bg-muted', className)}
    >
      {url && (
        <Image src={url} alt={t.title} fill sizes={sizes} className="object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
      )}
    </QuickViewLink>
  );
}

function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{children}</h2>
      {action}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The member card — 3D tilt + accent gradient
// ---------------------------------------------------------------------------

const TILT_DEG = 6;

/**
 * Subtle 3D tilt toward the pointer with an accent sheen that follows it.
 * Mouse/pen only (touch scrolls normally); off under reduced motion.
 */
function TiltCard({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();
  // Tilt follows the pointer and settles flat on leave.
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const rotateX = useSpring(useTransform(py, [0, 1], [TILT_DEG, -TILT_DEG]), { stiffness: 200, damping: 20 });
  const rotateY = useSpring(useTransform(px, [0, 1], [-TILT_DEG, TILT_DEG]), { stiffness: 200, damping: 20 });
  // The sheen keeps its last position and fades out on leave (instead of
  // snapping to — and lingering in — the middle of the card).
  const sx = useMotionValue(50);
  const sy = useMotionValue(50);
  const sheenOpacity = useSpring(0, { stiffness: 160, damping: 24 });
  const sheen = useMotionTemplate`radial-gradient(420px circle at ${sx}% ${sy}%, color-mix(in oklab, var(--primary) 22%, transparent), transparent 60%)`;

  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (reduce || e.pointerType === 'touch') return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    px.set(x);
    py.set(y);
    sx.set(x * 100);
    sy.set(y * 100);
    sheenOpacity.set(1);
  };
  const leave = () => {
    px.set(0.5);
    py.set(0.5);
    sheenOpacity.set(0);
  };

  return (
    <div style={{ perspective: 1200 }}>
      <motion.div
        onPointerMove={move}
        onPointerLeave={leave}
        style={reduce ? undefined : { rotateX, rotateY, transformStyle: 'preserve-3d' }}
        // Accent gradient border: 1px of gradient around the card face.
        className="relative rounded-2xl bg-linear-to-br from-primary via-primary/30 to-border p-px shadow-elevation-card"
      >
        <div className="relative rounded-2xl bg-card">
          {/* Accent wash across the face + pointer-following sheen. */}
          <div aria-hidden className="pointer-events-none absolute inset-0 rounded-2xl bg-linear-to-br from-primary/15 via-transparent to-transparent" />
          {!reduce && (
            <motion.div aria-hidden className="pointer-events-none absolute inset-0 rounded-2xl" style={{ background: sheen, opacity: sheenOpacity }} />
          )}
          {children}
        </div>
      </motion.div>
    </div>
  );
}

function MemberCard({
  showcase,
  owner,
  accent,
  onAccent,
}: {
  showcase: ProfileShowcase;
  owner: boolean;
  accent: AccentColor | null;
  onAccent: (a: AccentColor | null) => void;
}) {
  const p = showcase.overview.profile;
  const { feature, featureLabel, tally, stamps, country } = memberCardModel(showcase);

  return (
    <TiltCard>
      {/* Half-circle notches punched into the edge: they sit inside the card
          (covering the 1px gradient border) with an accent edge that continues
          the outline — nothing pokes out past the card. */}
      {/* Only on md+, where they line up with the side-by-side stub divider. */}
      <span aria-hidden className="absolute -left-px top-1/2 z-10 hidden h-6 w-3 -translate-y-1/2 rounded-r-full border border-l-0 border-primary/50 bg-background md:block" />
      <span aria-hidden className="absolute -right-px top-1/2 z-10 hidden h-6 w-3 -translate-y-1/2 rounded-l-full border border-r-0 border-primary/50 bg-background md:block" />
      <div className="relative flex flex-col md:flex-row">
        <div className="flex flex-1 flex-col gap-4 p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 font-mono text-xs uppercase tracking-[0.25em] text-muted-foreground">
            <span>Est. {estDate(p.memberSince)}</span>
            {tally.length > 0 && <span className="sm:text-right">{tally.join(' · ')}</span>}
          </div>
          <div className="flex items-center gap-4">
            <UserAvatar avatarUrl={p.avatarUrl} firstName={p.firstName} lastName={p.lastName} size="lg" className="h-20 w-20 text-2xl" />
            <div className="min-w-0">
              <h1 className="flex items-center gap-2 text-h1 leading-tight">
                {nameOf(p)}
                {isVerifiedAccount(p.username) && <VerifiedBadge size="lg" />}
              </h1>
              <p className="text-sm text-muted-foreground">
                @{p.username}
                {country ? ` · ${country}` : ''}
              </p>
            </div>
          </div>
          {p.bio && <p className="max-w-xl text-sm text-foreground/90">{p.bio}</p>}
          <p className="border-l-2 border-primary pl-3 text-sm italic">{billingLine(showcase)}</p>
          {stamps.length > 0 && (
            <ul className="flex flex-wrap gap-3">
              {stamps.map((s, i) => (
                <li
                  key={s.label}
                  className={cn(
                    'flex flex-col items-center justify-center rounded-full border-2 border-dashed border-primary/60 px-4 py-2 text-center',
                    i % 2 ? 'rotate-2' : '-rotate-2',
                  )}
                >
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{s.label}</span>
                  <span className="text-sm font-bold">{s.value}</span>
                </li>
              ))}
            </ul>
          )}
          <SocialLine overview={showcase.overview} />
          <ActionBar showcase={showcase} owner={owner} accent={accent} onAccent={onAccent} />
        </div>
        {feature && (
          <div className="relative flex items-center gap-4 overflow-hidden rounded-b-2xl border-t border-dashed border-border p-5 md:w-56 md:flex-col md:justify-center md:gap-2 md:rounded-r-2xl md:rounded-bl-none md:border-l md:border-t-0 md:p-6">
            {/* The stub wears the title's artwork: backdrop if TMDB has one,
                else the poster — faded into the card so the poster and
                caption on top stay readable. */}
            {(feature.backdropPath || feature.posterPath) && (
              <>
                <Image
                  src={buildImageUrl(feature.backdropPath ?? feature.posterPath, 'w780')!}
                  alt=""
                  fill
                  sizes="224px"
                  className="object-cover opacity-40"
                />
                <div aria-hidden className="absolute inset-0 bg-linear-to-t from-card via-card/60 to-card/20 md:bg-linear-to-r md:from-card md:via-card/50 md:to-card/10" />
              </>
            )}
            <Poster
              t={feature}
              className="relative h-24 w-16 shrink-0 shadow-elevation-card md:order-2 md:h-48 md:w-32"
              onOpen={() => trackProfile(p.userId, 'title_opened', `${feature.mediaType}:${feature.tmdbId}`, { section: 'card' })}
            />
            {/* Phones: caption beside the poster. md+: the wrapper dissolves
                (contents) so the label sits above and the title below it. */}
            <div className="relative flex min-w-0 flex-col gap-1 md:contents">
              <span className="relative text-[10px] font-semibold uppercase tracking-widest text-primary md:order-1">
                {featureLabel}
              </span>
              <span className="relative max-w-full truncate text-sm font-medium md:order-3 md:text-center">{feature.title}</span>
            </div>
          </div>
        )}
      </div>
    </TiltCard>
  );
}

function SocialLine({ overview }: { overview: Overview }) {
  const u = overview.profile.username;
  const mutuals = overview.mutualFollowers;
  const [mutualsOpen, setMutualsOpen] = useState(false);
  const shown = mutuals.users.slice(0, 2);
  return (
    <p className="text-sm text-muted-foreground">
      <Link href={`/user/${u}/followers`} className="hover:text-foreground">
        <strong className="text-foreground">{overview.followSummary.followersCount}</strong> followers
      </Link>
      {' · '}
      <Link href={`/user/${u}/following`} className="hover:text-foreground">
        <strong className="text-foreground">{overview.followSummary.followingCount}</strong> following
      </Link>
      {mutuals.totalCount > 0 && (
        <>
          {' · '}
          {/* "Followed by" and "+N" open the full list; each name goes to that profile. */}
          <button
            type="button"
            onClick={() => setMutualsOpen(true)}
            className="hover:text-foreground hover:underline underline-offset-4 cursor-pointer"
          >
            Followed by
          </button>{' '}
          {shown.map((m, i) => (
            <span key={m.id}>
              {i > 0 && ', '}
              <Link
                href={`/user/${m.username}`}
                className="font-medium text-foreground transition-colors hover:text-primary hover:underline underline-offset-4"
              >
                {m.username}
              </Link>
            </span>
          ))}
          {mutuals.totalCount > shown.length && (
            <>
              {' '}
              <button
                type="button"
                onClick={() => setMutualsOpen(true)}
                aria-label={`See all ${mutuals.totalCount} people you follow who follow ${u}`}
                className="hover:text-foreground hover:underline underline-offset-4 cursor-pointer"
              >
                +{mutuals.totalCount - shown.length}
              </button>
            </>
          )}
          <MutualFollowersModal
            isOpen={mutualsOpen}
            onClose={() => setMutualsOpen(false)}
            targetId={overview.profile.userId}
            username={u}
            initial={mutuals.users}
            totalCount={mutuals.totalCount}
          />
        </>
      )}
    </p>
  );
}

/** Owner: Edit · Accent · Preview · Share. Visitor: Follow · Share. */
function ActionBar({
  showcase,
  owner,
  accent,
  onAccent,
}: {
  showcase: ProfileShowcase;
  owner: boolean;
  accent: AccentColor | null;
  onAccent: (a: AccentColor | null) => void;
}) {
  const { overview } = showcase;
  const p = overview.profile;
  const toast = useToast();
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [swatchesOpen, setSwatchesOpen] = useState(false);

  const share = async () => {
    const url = `${window.location.origin}/user/${p.username}?ref=share`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Profile link copied', url);
    } catch {
      toast.info('Share this link', url);
    }
    trackProfile(p.userId, 'share', undefined, { channel: 'copy_link' });
  };

  // Last saved accent: previews (dragging the wheel) aren't saved, so a
  // failed save rolls back to this, not to a mid-drag colour.
  const savedAccent = useRef(accent);
  const saveAccent = async (next: AccentColor | null) => {
    const prev = savedAccent.current;
    onAccent(next); // instant recolor
    try {
      await updateProfileAction({ displayName: p.displayName, bio: p.bio, avatarUrl: p.avatarUrl, accentColor: next });
      savedAccent.current = next;
      router.refresh();
    } catch {
      onAccent(prev);
      toast.error("Couldn't save your accent", 'Please try again.');
    }
  };

  const btn =
    'inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-card/60 px-3 text-sm font-medium hover:bg-foreground/5 cursor-pointer';

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {owner ? (
          <>
            <button type="button" className={btn} onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4" /> Edit
            </button>
            <button type="button" className={btn} aria-expanded={swatchesOpen} onClick={() => setSwatchesOpen((v) => !v)}>
              <Palette className="h-4 w-4" /> Accent
            </button>
            <Link href="/me?as=visitor" className={btn}>
              <Eye className="h-4 w-4" /> Preview as visitor
            </Link>
          </>
        ) : (
          <span onClickCapture={() => trackProfile(p.userId, 'follow')}>
            <FollowButton
              targetUserId={p.userId}
              initialStatus={overview.followState.status}
              isSelf={overview.isSelf}
              blocked={overview.followState.blocked}
            />
          </span>
        )}
        <button type="button" onClick={() => void share()} className={btn}>
          <Link2 className="h-4 w-4" /> Share
        </button>
        {owner && <StoryExportButton userId={p.userId} username={p.username} accent={accent} className={btn} />}
        {/* Block / unblock — signed-in visitors only (not in owner preview). */}
        {!owner && showcase.viewerSignedIn && !overview.isSelf && (
          <ProfileMoreMenu targetUserId={p.userId} targetUsername={p.username} isBlocked={overview.followState.blocked} />
        )}
      </div>

      {owner && (
        <Modal
          isOpen={swatchesOpen}
          onClose={() => setSwatchesOpen(false)}
          title="Accent colour"
          className="max-w-lg gap-1 p-5 sm:p-6"
        >
          <p className="mb-4 pr-8 text-sm text-muted-foreground">
            Colours your profile, your card and buttons for you. Changes save as you pick.
          </p>
          <AccentPicker value={accent} onPreview={onAccent} onCommit={(next) => void saveAccent(next)} defaultCustomOpen />
          <div className="mt-5 flex justify-end">
            <Button onClick={() => setSwatchesOpen(false)}>Done</Button>
          </div>
        </Modal>
      )}

      {owner && (
        <ProfileEditModal
          isOpen={editOpen}
          onClose={() => setEditOpen(false)}
          initial={{
            displayName: p.displayName,
            bio: p.bio,
            avatarUrl: p.avatarUrl,
            accentColor: accent,
            firstName: p.firstName,
            lastName: p.lastName,
            username: p.username,
          }}
          cardFeature={{ initial: p.cardFeature, favorites: showcase.pickerFavorites }}
          onSubmit={async (values) => {
            await updateProfileAction(values);
            onAccent(values.accentColor);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}


/** Visitor's taste match (or a sign-in nudge for guests). */
function MatchStrip({ showcase }: { showcase: ProfileShowcase }) {
  const { match, overview } = showcase;
  if (overview.isSelf && !match) return null;
  if (!match) {
    if (showcase.viewerSignedIn) return null;
    return (
      <div className="rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
        <Link href="/signin" className="text-primary hover:underline">Sign in</Link> to see how your taste matches.
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-card px-4 py-3">
      <span className="text-2xl font-bold tabular-nums text-primary">{match.percent}%</span>
      <span className="text-sm text-muted-foreground">
        taste match
        {match.sharedGenres.length > 0 && <> · you both lean {match.sharedGenres.slice(0, 2).join(' & ').toLowerCase()}</>}
        {match.theirPick && <> · start with <strong className="text-foreground">{match.theirPick.title}</strong></>}
      </span>
      <div className="ml-auto flex -space-x-2">
        {match.shared.slice(0, 4).map((t) => (
          <Poster key={`${t.mediaType}:${t.tmdbId}`} t={t} className="h-12 w-8 ring-2 ring-card" sizes="32px" />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Profile tab sections
// ---------------------------------------------------------------------------

function FeaturePresentation({ showcase, owner }: { showcase: ProfileShowcase; owner: boolean }) {
  // The owner's picks (up to 6, in order); without picks, favorites ranked by their ratings.
  const [featured, setFeatured] = useState<InsightTitle[]>(showcase.featured);
  const [editing, setEditing] = useState(false);
  const router = useRouter();
  const picked = featured.length > 0;
  const titles: (InsightTitle & { rating?: number | null })[] = picked ? featured : rankedFavorites(showcase, 4);
  const pid = showcase.overview.profile.userId;
  if (titles.length === 0 && !owner) return null;

  const [crown, ...supports] = titles;
  const why = picked
    ? 'Their #1 pick'
    : crown?.rating
      ? `Their highest-rated favorite (${crown.rating}★)`
      : 'Their most recent favorite';
  const open = (t: InsightTitle, position: number) => () =>
    trackProfile(pid, 'title_opened', `${t.mediaType}:${t.tmdbId}`, { section: 'feature', position });

  return (
    <section>
      <SectionTitle
        action={
          owner ? (
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              {picked ? 'Picked by you' : 'Ranked by your ratings'}
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 font-medium text-foreground hover:bg-secondary cursor-pointer"
              >
                <Pencil className="h-3 w-3" /> {picked ? 'Edit' : 'Pick titles'}
              </button>
            </span>
          ) : undefined
        }
      >
        Feature presentation
      </SectionTitle>
      {!crown ? (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="w-full rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground hover:text-foreground cursor-pointer"
        >
          Pick up to 6 titles from your favorites and watchlists to headline your profile.
        </button>
      ) : (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="flex flex-col items-center gap-1">
            <Crown className="h-5 w-5 text-primary" aria-label={why}>
              <title>{why}</title>
            </Crown>
            <Poster t={crown} className="h-64 w-44 shadow-elevation-card" onOpen={open(crown, 1)} />
            <span className="max-w-44 truncate text-sm font-semibold">{crown.title}</span>
          </div>
          <div className="flex flex-wrap gap-3">
            {supports.map((t, i) => (
              <div key={`${t.mediaType}:${t.tmdbId}`} className="flex flex-col gap-1">
                <Poster t={t} className="h-44 w-28" onOpen={open(t, i + 2)} />
                <span className="max-w-28 truncate text-xs text-muted-foreground">{t.title}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {editing && (
        <FeaturePicker
          initial={featured}
          onClose={() => setEditing(false)}
          onSaved={(next) => {
            setFeatured(next);
            // The member card's "Their #1" follows the first pick.
            router.refresh();
          }}
        />
      )}
    </section>
  );
}

function Programmes({ showcase, onOpenLibrary }: { showcase: ProfileShowcase; onOpenLibrary: () => void }) {
  const lists = showcase.overview.publicWatchlists.slice(0, 3);
  if (lists.length === 0) return null;
  return (
    <section>
      <SectionTitle
        action={
          <button type="button" onClick={onOpenLibrary} className="text-sm text-muted-foreground hover:text-foreground cursor-pointer">
            See library →
          </button>
        }
      >
        Programmes
      </SectionTitle>
      {/* Same cover cards as the Watchlists page (read-only here). */}
      <ul className="grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3">
        {lists.map((w) => (
          <WatchlistCoverCard key={w.id} list={w} />
        ))}
      </ul>
    </section>
  );
}

/** C's stat frames as a breakdown section. */
function ByTheNumbers({ showcase }: { showcase: ProfileShowcase }) {
  const { overview, insights } = showcase;
  const weights = overview.tasteProfile.genreWeights ?? [];
  const total = insights.mix.films + insights.mix.series;
  const films = total ? Math.round((insights.mix.films / total) * 100) : 0;
  const frames: { key: FrameKey; label: string; node: ReactNode; background?: string | null }[] = [];
  if (weights.length) {
    const max = weights[0].count;
    frames.push({
      key: 'taste',
      label: 'Taste DNA',
      node: (
        <>
        {/* Spread across the frame: as a tall cell it spans two rows of
            backdrop cards, and packing the rows at the top left a hole. */}
        <ul className="flex flex-1 flex-col justify-between gap-2">
          {weights.map((w) => (
            <li key={w.name} className="flex items-center gap-3 text-sm">
              <span className="w-28 shrink-0 truncate">{w.name}</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.round((w.count / max) * 100)}%` }} />
              </span>
              <span className="w-8 text-right text-xs tabular-nums text-muted-foreground">{w.count}</span>
            </li>
          ))}
        </ul>
        </>
      ),
    });
  }
  if (total >= 3) {
    frames.push({
      key: 'mix',
      label: 'Films vs series',
      node: (
        <>
        <p className="text-3xl font-bold">
          {films}% <span className="text-base font-normal text-muted-foreground">films</span>
        </p>
        <span className="mt-2 flex h-2 overflow-hidden rounded-full bg-secondary">
          <span className="bg-primary" style={{ width: `${films}%` }} />
        </span>
        <p className="mt-2 text-xs text-muted-foreground">
          {insights.mix.films} films · {insights.mix.series} series
        </p>
        </>
      ),
    });
  }
  if (overview.tasteProfile.decades[0]) {
    frames.push({
      key: 'era',
      label: 'Favourite era',
      node: (
        <>
        <p className="text-3xl font-bold">{overview.tasteProfile.decades[0]}</p>
        <p className="text-sm text-muted-foreground">then {overview.tasteProfile.decades.slice(1).join(', ') || '—'}</p>
        </>
      ),
    });
  }
  if (insights.reviews.count > 0) {
    // The featured (best-rated written) review, shown like Coming soon: its
    // title's backdrop behind, poster + quote along the bottom.
    const top = insights.reviews.top;
    frames.push({
      key: 'voice',
      label: 'Review voice',
      background: top ? (top.title.backdropPath ?? top.title.posterPath) : undefined,
      node: (
        <>
        <p className="text-3xl font-bold">
          {insights.reviews.average}★ <span className="text-base font-normal text-muted-foreground">avg of {insights.reviews.count}</span>
        </p>
        {top && (
          <div className="mt-auto flex items-end gap-3 pt-6">
            <Poster t={top.title} className="h-20 w-14 shrink-0 shadow-lg" sizes="56px" />
            <div className="min-w-0">
              <p className="line-clamp-2 text-sm italic">&ldquo;{top.body}&rdquo;</p>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                <QuickViewLink
                  mediaType={top.title.mediaType}
                  titleId={top.title.tmdbId}
                  className="font-semibold text-foreground transition-colors hover:text-primary hover:underline underline-offset-4"
                >
                  {top.title.title}
                </QuickViewLink>
                {top.title.year ? ` · ${top.title.year}` : ''} · {top.rating}★
              </p>
            </div>
          </div>
        )}
        </>
      ),
    });
  }
  if (insights.swipes && insights.swipes.total > 0) {
    const s = insights.swipes;
    const likeRate = Math.round(((s.liked + s.saved) / s.total) * 100);
    const bars = [
      { label: 'Liked', value: s.liked },
      { label: 'Favorited', value: s.saved },
      { label: 'Passed', value: s.passed },
    ];
    frames.push({
      key: 'swipe',
      label: 'Watchly Swipe',
      node: (
        <>
        <p className="text-3xl font-bold tabular-nums">
          {s.total.toLocaleString()} <span className="text-base font-normal text-muted-foreground">swipes</span>
        </p>
        <p className="text-sm text-muted-foreground">
          Said yes to {likeRate}%{likeRate < 35 ? ' — a tough crowd' : likeRate > 70 ? ' — easy to please' : ''}
        </p>
        <ul className="mt-3 flex flex-col gap-1.5">
          {bars.map((b) => (
            <li key={b.label} className="flex items-center gap-3 text-sm">
              <span className="w-20 shrink-0">{b.label}</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                <span
                  className={cn('block h-full rounded-full', b.label === 'Passed' ? 'bg-muted-foreground/50' : 'bg-primary')}
                  style={{ width: `${Math.round((b.value / s.total) * 100)}%` }}
                />
              </span>
              <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">{b.value}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Eye className="h-3.5 w-3.5" /> Only you can see this
          </span>
          <Link href="/swipe/history" className="hover:text-foreground">
            Swipe history →
          </Link>
        </p>
        </>
      ),
    });
  }
  if (insights.comingSoon) {
    const t = insights.comingSoon;
    frames.push({
      key: 'soon',
      label: 'Coming soon',
      background: t.backdropPath ?? t.posterPath,
      node: (
        <div className="mt-auto flex items-end gap-3 pt-6">
          <Poster t={t} className="h-20 w-14 shrink-0 shadow-lg" sizes="56px" />
          <div className="min-w-0">
            <QuickViewLink
              mediaType={t.mediaType}
              titleId={t.tmdbId}
              className="line-clamp-2 font-semibold leading-tight transition-colors hover:text-primary hover:underline underline-offset-4"
            >
              {t.title}
            </QuickViewLink>
            <p className="text-xs text-muted-foreground">{t.year ? `${t.year} · ` : ""}Up next</p>
          </div>
        </div>
      ),
    });
  }
  if (frames.length === 0) return null;
  return (
    <section>
      <SectionTitle>By the numbers</SectionTitle>
      <div className="relative pl-8">
        <div aria-hidden className="absolute bottom-0 left-0 top-0 w-5 rounded-sm bg-black">
          <div className="flex h-full flex-col justify-around py-2">
            {Array.from({ length: 24 }).map((_, i) => (
              <span key={i} className="mx-auto h-1.5 w-2 rounded-[1px] bg-white/25" />
            ))}
          </div>
        </div>
        {/* Bento: dense packing back-fills gaps when a frame is absent. */}
        <ol className="grid grid-flow-row-dense grid-cols-1 gap-3 sm:grid-cols-2">
          {bentoLayout(frames.map((f) => f.key)).map(({ key, size }, i) => {
            const f = frames.find((x) => x.key === key)!;
            return (
              <Frame key={key} n={i + 1} label={f.label} size={size} background={f.background}>
                {f.node}
              </Frame>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

type FrameKey = 'taste' | 'mix' | 'era' | 'voice' | 'swipe' | 'soon';
type FrameSize = 'sm' | 'tall' | 'wide';

// Bento layout (2 cols):  mix | era  /  soon | taste(tall)  /  voice | taste  /  swipe(wide)
const BENTO_ORDER: FrameKey[] = ['mix', 'era', 'soon', 'taste', 'voice', 'swipe'];
const BENTO_SIZE: Record<FrameKey, FrameSize> = {
  mix: 'sm',
  era: 'sm',
  soon: 'sm',
  taste: 'tall',
  voice: 'sm',
  swipe: 'wide',
};

/**
 * Bento order + sizes for whichever frames exist, adjusted so the 2-column
 * grid has no holes: the 1-column cells (small = 1, tall = 2) must pair up.
 * If they don't, the tall card shrinks to small; with no tall card, the
 * last small card stretches wide.
 */
function bentoLayout(keys: FrameKey[]): { key: FrameKey; size: FrameSize }[] {
  const items = [...keys]
    .sort((a, b) => BENTO_ORDER.indexOf(a) - BENTO_ORDER.indexOf(b))
    .map((key) => ({ key, size: BENTO_SIZE[key] }));
  const cells = items.reduce((n, i) => n + (i.size === 'sm' ? 1 : i.size === 'tall' ? 2 : 0), 0);
  if (cells % 2 === 1) {
    const tall = items.find((i) => i.size === 'tall');
    if (tall) tall.size = 'sm';
    else {
      const lastSmall = [...items].reverse().find((i) => i.size === 'sm');
      if (lastSmall) lastSmall.size = 'wide';
    }
  }
  return items;
}

/**
 * A bento cell. Rows stretch to their tallest neighbour (e.g. a tall Taste DNA),
 * so content sits in a flex-1 column, and an optional backdrop fills the cell
 * so short frames never read as empty boxes.
 */
function Frame({
  n,
  label,
  size = 'sm',
  background,
  children,
}: {
  n: number;
  label: string;
  size?: FrameSize;
  background?: string | null;
  children: ReactNode;
}) {
  const bg = background ? buildImageUrl(background, 'w780') : null;
  return (
    <li
      className={cn(
        'relative flex min-h-32 flex-col overflow-hidden rounded-xl border border-border bg-card p-4',
        size === 'tall' && 'sm:row-span-2',
        size === 'wide' && 'sm:col-span-2',
      )}
    >
      {bg && (
        <>
          <Image src={bg} alt="" fill sizes="(min-width: 640px) 50vw, 100vw" className="object-cover opacity-40" />
          <div aria-hidden className="absolute inset-0 bg-linear-to-t from-card via-card/70 to-card/30" />
        </>
      )}
      <p className="relative mb-2 flex items-baseline gap-2">
        <span className="font-mono text-xs text-muted-foreground">{String(n).padStart(2, '0')}</span>
        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{label}</span>
      </p>
      <div className="relative flex flex-1 flex-col">{children}</div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Library · Reviews tabs
// ---------------------------------------------------------------------------

type ProfileReview = Awaited<ReturnType<typeof getProfileReviewsAction>>['items'][number];

function Stars({ rating }: { rating: number }) {
  return (
    <span className="flex items-center gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {Array.from({ length: Math.floor(rating) }).map((_, i) => (
        <Star key={i} className="h-3.5 w-3.5 fill-primary text-primary" />
      ))}
      {rating % 1 !== 0 && <StarHalf className="h-3.5 w-3.5 fill-primary text-primary" />}
    </span>
  );
}

/** Cache key + loader for a profile's first page of reviews (tab + hover prefetch). */
function reviewsLoad(username: string, preview: boolean) {
  return {
    key: `profile-reviews:${username}:${preview ? 'guest' : 'viewer'}`,
    fetcher: () => getProfileReviewsAction(username, { asGuest: preview }),
  };
}

/** Every review, newest first, a page at a time (loaded when the tab opens). */
function Reviews({ showcase, preview }: { showcase: ProfileShowcase; preview: boolean }) {
  const r = showcase.insights.reviews;
  const username = showcase.overview.profile.username;
  // First page through the tab cache (instant when you come back to the tab);
  // "Show more" pages are appended locally.
  const { key, fetcher } = reviewsLoad(username, preview);
  const first = useCachedLoad(key, fetcher, r.count > 0);
  const [more, setMore] = useState<{ items: ProfileReview[]; hasMore: boolean } | null>(null);
  const [loading, setLoading] = useState(false);
  const [moreFailed, setMoreFailed] = useState(false);
  const items = first.data ? [...first.data.items, ...(more?.items ?? [])] : null;
  const hasMore = more ? more.hasMore : (first.data?.hasMore ?? false);
  const failed = first.failed || moreFailed;

  const load = async (offset: number) => {
    if (offset === 0) return first.retry();
    setLoading(true);
    setMoreFailed(false);
    try {
      const page = await getProfileReviewsAction(username, { asGuest: preview, offset });
      setMore((cur) => ({ items: [...(cur?.items ?? []), ...page.items], hasMore: page.hasMore }));
    } catch {
      setMoreFailed(true);
    } finally {
      setLoading(false);
    }
  };

  if (r.count === 0) return <Empty text="No reviews yet." />;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        <strong className="text-foreground">{r.count}</strong> {r.count === 1 ? 'review' : 'reviews'} · average{' '}
        <strong className="text-foreground">{r.average}★</strong>
      </p>
      {items === null && !failed && (
        <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading reviews">
          {Array.from({ length: Math.min(r.count, 3) }).map((_, i) => (
            <div key={i} className="h-28 rounded-xl border border-border bg-card animate-pulse" />
          ))}
        </div>
      )}
      {items && (
        <ul className="flex flex-col gap-3">
          {items.map((rev) => (
            <ReviewRow key={rev.id} review={rev} />
          ))}
        </ul>
      )}
      {failed && (
        <p className="text-sm text-muted-foreground">
          Couldn&apos;t load reviews.{' '}
          <button type="button" onClick={() => void load(items?.length ?? 0)} className="text-primary hover:underline cursor-pointer">
            Try again
          </button>
        </p>
      )}
      {items && hasMore && !failed && (
        <button
          type="button"
          disabled={loading}
          onClick={() => void load(items.length)}
          className="self-center rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-foreground/5 disabled:opacity-60 cursor-pointer"
        >
          {loading ? 'Loading…' : 'Show more reviews'}
        </button>
      )}
    </div>
  );
}

function ReviewRow({ review }: { review: ProfileReview }) {
  const [open, setOpen] = useState(false);
  const poster = buildImageUrl(review.posterPath, 'w185');
  const long = (review.body?.length ?? 0) > 280;
  const edited = review.updatedAt !== review.createdAt;
  return (
    <li className="flex gap-4 rounded-xl border border-border bg-card p-4">
      <QuickViewLink
        mediaType={review.titleType}
        titleId={review.titleId}
        className="relative h-24 w-16 shrink-0 overflow-hidden rounded-md bg-muted"
        aria-label={review.title || 'Open title'}
      >
        {poster && <Image src={poster} alt="" fill sizes="64px" className="object-cover" />}
      </QuickViewLink>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <QuickViewLink mediaType={review.titleType} titleId={review.titleId} className="font-medium hover:text-primary">
            {review.title || 'Unknown title'}
          </QuickViewLink>
          {review.year && <span className="text-xs text-muted-foreground">{review.year}</span>}
        </div>
        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
          <Stars rating={review.rating} />
          <span>
            {formatRelativeAgo(review.updatedAt)}
            {edited && ' · edited'}
          </span>
        </div>
        {review.body ? (
          <>
            <div className="mt-2">
              {review.isSpoiler && !open ? (
                <SpoilerText text={review.body} isSpoiler className="text-sm" clampClassName="line-clamp-4" />
              ) : (
                <blockquote className={cn('whitespace-pre-line text-sm', !open && 'line-clamp-4')}>{review.body}</blockquote>
              )}
            </div>
            {long && !review.isSpoiler && (
              <button type="button" onClick={() => setOpen((v) => !v)} className="mt-1 text-xs text-primary hover:underline cursor-pointer">
                {open ? 'Show less' : 'Read more'}
              </button>
            )}
          </>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">Rated, no written review.</p>
        )}
      </div>
    </li>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">{text}</p>;
}

// ---------------------------------------------------------------------------
// People you might know — owner only, collapsible
// ---------------------------------------------------------------------------


/**
 * The follow-suggestions row from the old /me, as a section the owner can
 * collapse. The open/closed choice is remembered per browser (a viewer
 * convenience — storage may be unavailable, so it's best-effort).
 */
function PeopleYouMightKnow({ suggestions }: { suggestions: ProfileShowcase['followSuggestions'] }) {
  // Always starts collapsed — suggestions are opt-in, never pushed open.
  const [open, setOpen] = useState(false);
  if (suggestions.length === 0) return null;

  const toggle = () => setOpen((v) => !v);

  return (
    <section className="rounded-xl border border-border bg-card">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls="pymk-panel"
        className="flex w-full items-center gap-2 px-4 py-3 text-left cursor-pointer"
      >
        <Users className="h-4 w-4 text-primary" />
        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">People you might know</span>
        <span className="text-xs tabular-nums text-muted-foreground">{suggestions.length}</span>
        <ChevronDown className={cn('ml-auto h-4 w-4 text-muted-foreground transition-transform', !open && '-rotate-90')} />
      </button>
      {open && (
        <div id="pymk-panel" className="border-t border-border px-4 pb-4 pt-3">
          <FollowSuggestionsRow suggestions={suggestions} hideHeading />
        </div>
      )}
    </section>
  );
}
