'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Pencil,
  Heart,
  Bookmark,
  Calendar,
  ExternalLink,
  Activity as ActivityIcon,
  Eye,
  Search,
  ArrowRight,
  ArrowLeftRight,
  MapPin,
  Star,
} from 'lucide-react';
import { getCountryName } from '@/lib/regions/countries';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/ui/user-avatar';
import { EmptyState } from '@/components/watchly/EmptyState';
import { WatchlistCard } from '@/components/watchlists/WatchlistCard';
import { FavoriteCard } from '@/components/favorites/FavoriteCard';
import { WatchedCard } from '@/components/watched/WatchedCard';
import { ActivityRow } from '@/components/activity/ActivityRow';
import { TitleTabs } from '@/components/title/TitleTabs';
import { TasteProfile } from './TasteProfile';
import { FollowSuggestionsRow } from '@/components/social/FollowSuggestionsRow';
import { FollowListTabPanel } from '@/components/social/FollowListTabPanel';
import { ProfileBanner } from './ProfileBanner';
import { VerifiedBadge } from './VerifiedBadge';
import { isVerifiedAccount } from '@/constants/verifiedAccounts';
import { unmarkWatchedAction } from '@/actions/watched';
import type { EnrichedWatched } from '@/services/watched';
import {
  listMyFollowersAction,
  listMyFollowingAction,
} from '@/actions/social';
import { useAuthStore } from '@/client/stores/auth';
import { useToast } from '@/hooks/useToast';
import { updateProfileAction } from '@/actions/profile';
import { ProfileEditModal } from './ProfileEditModal';
import { ReviewCard } from './ReviewCard';
import { FEATURES } from '@/constants/features';
import { getMyReviewsAction } from '@/actions/reviews';
import type { EnrichedReview } from '@/services/reviews';
import { ErrorState } from '@/components/watchly/ErrorState';
import type { AccentSlug } from '@/constants/accentColors';
import type { ProfileOverview } from '@/services/profile';

interface MyProfileClientProps {
  overview: ProfileOverview;
}

function formatMemberSince(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long' });
}

export function MyProfileClient({ overview: initialOverview }: MyProfileClientProps) {
  const [overview, setOverview] = useState(initialOverview);
  const {
    profile,
    recentWatchlists,
    recentFavorites,
    recentActivity,
    tasteProfile,
    followSuggestions,
    bannerPosters,
    watchedTitles: initialWatchedTitles,
  } = overview;
  const [watchedTitles, setWatchedTitles] =
    useState<EnrichedWatched[]>(initialWatchedTitles);
  const [unwatchPendingKey, setUnwatchPendingKey] = useState<string | null>(
    null,
  );
  const [activeTab, setActiveTab] = useState<
    | 'overview'
    | 'watchlists'
    | 'favorites'
    | 'activity'
    | 'reviews'
    | 'followers'
    | 'following'
    | 'watched'
  >('overview');
  const [isEditOpen, setEditOpen] = useState(false);

  // Reviews are lazy-loaded the first time the Reviews tab is opened (they
  // need TMDB enrichment, so we don't pay that cost on every profile load).
  const [reviews, setReviews] = useState<EnrichedReview[] | null>(null);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewsError, setReviewsError] = useState(false);
  const reviewsRequested = useRef(false);

  const loadReviews = () => {
    if (reviewsRequested.current) return;
    reviewsRequested.current = true;
    setReviewsLoading(true);
    setReviewsError(false);
    getMyReviewsAction()
      .then(setReviews)
      .catch(() => setReviewsError(true))
      .finally(() => setReviewsLoading(false));
  };
  const user = useAuthStore((s) => s.user);
  const setAuthenticated = useAuthStore((s) => s.setAuthenticated);
  const router = useRouter();
  const toast = useToast();

  const handleSubmit = async (values: {
    displayName: string;
    bio: string;
    avatarUrl: string;
    accentColor: AccentSlug | null;
  }) => {
    await updateProfileAction(values);

    setOverview((o) => ({
      ...o,
      profile: {
        ...o.profile,
        displayName: values.displayName,
        bio: values.bio,
        avatarUrl: values.avatarUrl,
        accentColor: values.accentColor,
      },
    }));

    if (user) {
      setAuthenticated({ ...user, avatarUrl: values.avatarUrl });
    }

    toast.success('Profile updated');
    router.refresh();
  };

  const handleUnwatch = async (mediaType: 'movie' | 'tv', mediaId: string) => {
    const key = `${mediaType}:${mediaId}`;
    setUnwatchPendingKey(key);
    // Optimistic removal — the server action is the source of truth so
    // we revert if it throws.
    const snapshot = watchedTitles;
    setWatchedTitles((prev) =>
      prev.filter(
        (w) => !(w.mediaType === mediaType && w.mediaId === mediaId),
      ),
    );
    // Stat decrement so the badge count tracks the grid.
    setOverview((o) => ({
      ...o,
      profile: {
        ...o.profile,
        stats: {
          ...o.profile.stats,
          watchedCount: Math.max(0, o.profile.stats.watchedCount - 1),
        },
      },
    }));
    try {
      await unmarkWatchedAction(mediaType, mediaId);
    } catch {
      setWatchedTitles(snapshot);
      setOverview((o) => ({
        ...o,
        profile: {
          ...o.profile,
          stats: {
            ...o.profile.stats,
            watchedCount: o.profile.stats.watchedCount + 1,
          },
        },
      }));
      toast.error('Could not unwatch', 'Please try again.');
    } finally {
      setUnwatchPendingKey(null);
    }
  };

  const heading =
    profile.displayName ||
    `${profile.firstName} ${profile.lastName}`.trim() ||
    profile.username;

  const hasBanner = profile.bannerEnabled && bannerPosters.length > 0;

  return (
    <>
      <div className="flex flex-col">
        {hasBanner && <ProfileBanner posters={bannerPosters} />}
        <Card className={hasBanner ? 'rounded-t-none border-t-0' : undefined}>
        <CardHeader className="flex flex-row items-start gap-5 sm:gap-6">
          <UserAvatar
            avatarUrl={profile.avatarUrl}
            firstName={profile.firstName}
            lastName={profile.lastName}
            size="lg"
            className="!w-20 !h-20 text-2xl shrink-0"
          />
          <div className="flex-1 min-w-0 flex flex-col gap-1">
            <CardTitle className="text-h3 truncate inline-flex items-center gap-1.5">
              <span className="truncate">{heading}</span>
              {isVerifiedAccount(profile.username) && (
                <VerifiedBadge size="md" />
              )}
            </CardTitle>
            <Link
              href={`/user/${profile.username}`}
              className="text-sm text-muted-foreground hover:text-primary transition-colors inline-flex items-center gap-1 w-fit"
            >
              @{profile.username}
              <ExternalLink className="w-3 h-3" />
            </Link>
            {profile.bio && (
              <p className="text-sm text-foreground/90 mt-2 max-w-2xl whitespace-pre-line">
                {profile.bio}
              </p>
            )}
          </div>
          <Button
            variant="outline"
            onClick={() => setEditOpen(true)}
            className="gap-2 shrink-0"
          >
            <Pencil className="w-4 h-4" />
            Edit
          </Button>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
            <Link
              href="/favorites"
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <Heart className="w-4 h-4 text-primary" />
              <span>
                <strong className="text-foreground">
                  {profile.stats.favoritesCount}
                </strong>{' '}
                favorites
              </span>
            </Link>
            <Link
              href="/watchlists"
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <Bookmark className="w-4 h-4 text-primary" />
              <span>
                <strong className="text-foreground">
                  {profile.stats.watchlistsCount}
                </strong>{' '}
                watchlists
              </span>
            </Link>
            <button
              type="button"
              onClick={() => setActiveTab('watched')}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              <Eye className="w-4 h-4 text-primary" />
              <span>
                <strong className="text-foreground">
                  {profile.stats.watchedCount}
                </strong>{' '}
                watched
              </span>
            </button>
            <span className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="w-4 h-4" />
              Joined {formatMemberSince(profile.memberSince)}
            </span>
            {profile.region && (
              <span className="flex items-center gap-2 text-muted-foreground">
                <MapPin className="w-4 h-4" />
                {getCountryName(profile.region) || profile.region}
              </span>
            )}
          </div>
        </CardContent>
      </Card>
      </div>

      <TitleTabs
        tabs={[
          { key: 'overview', label: 'Overview' },
          { key: 'watchlists', label: 'Watchlists' },
          { key: 'favorites', label: 'Favorites' },
          { key: 'watched', label: 'Watched' },
          ...(FEATURES.reviews ? [{ key: 'reviews', label: 'Reviews' }] : []),
          { key: 'activity', label: 'Activity' },
          { key: 'followers', label: 'Followers' },
          { key: 'following', label: 'Following' },
        ]}
        activeKey={activeTab}
        onChange={(k) => {
          setActiveTab(k as typeof activeTab);
          if (k === 'reviews') loadReviews();
        }}
        className="mt-2"
      />

      {activeTab === 'overview' ? (
        <>
          {/* Bootstrap hint — when the user has very little taste data,
              point them at /swipe so they can start feeding the signal
              without leaving the page they're already on. */}
          {profile.stats.favoritesCount + profile.stats.watchedCount < 5 && (
            <Link
              href="/swipe"
              className="rounded-xl border border-primary/30 bg-primary/5 px-5 py-4 flex items-center justify-between gap-4 hover:bg-primary/10 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center text-primary shrink-0">
                  <ArrowLeftRight className="w-5 h-5" />
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-semibold text-foreground">
                    Get more out of For You
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Spend 60 seconds in WatchlySwipe and your recommendations
                    sharpen up.
                  </span>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-primary shrink-0" />
            </Link>
          )}

          {/* Follow suggestions row sits above the main grid — full-width
              so the horizontal scroller can breathe. Renders nothing when
              the user has no suggestions (e.g. first user in a deploy). */}
          <FollowSuggestionsRow suggestions={followSuggestions} />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: previews + activity (main column) */}
            <div className="lg:col-span-2 flex flex-col gap-6 lg:order-1">
              <OverviewSections
                recentWatchlists={recentWatchlists}
                recentFavorites={recentFavorites}
                recentActivity={recentActivity}
                watchlistsCount={profile.stats.watchlistsCount}
                favoritesCount={profile.stats.favoritesCount}
              />
            </div>

            {/* Right rail: taste profile (sticky on tall screens) */}
            <aside className="lg:col-span-1 flex flex-col gap-6 lg:order-2 lg:sticky lg:top-6 lg:self-start">
              <TasteProfile taste={tasteProfile} isSelf />
            </aside>
          </div>
        </>
      ) : null}

      {activeTab === 'watchlists' && (
        <>
          <SectionHeading
            title="Watchlists"
            href={profile.stats.watchlistsCount > 0 ? '/watchlists' : undefined}
          />
          {recentWatchlists.length === 0 ? (
            <EmptyState
              icon={Bookmark}
              title="No watchlists yet"
              description="Group titles you want to watch into lists you can share or keep private."
              action={
                <Link href="/watchlists">
                  <Button className="gap-2">
                    <Bookmark className="w-4 h-4" />
                    Open watchlists
                  </Button>
                </Link>
              }
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {recentWatchlists.map((w) => (
                <WatchlistCard key={w.id} watchlist={w} />
              ))}
            </div>
          )}
        </>
      )}

      {activeTab === 'favorites' && (
        <>
          <SectionHeading
            title="Favorites"
            href={profile.stats.favoritesCount > 0 ? '/favorites' : undefined}
          />
          {recentFavorites.length === 0 ? (
            <EmptyState
              icon={Heart}
              title="No favorites yet"
              description="Tap the heart on any title, collection, or artist to start your favorites."
              action={
                <Link href="/search">
                  <Button className="gap-2">
                    <Search className="w-4 h-4" />
                    Find something to watch
                  </Button>
                </Link>
              }
            />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {recentFavorites.map((fav) => (
                <FavoriteCard
                  key={`${fav.type}-${fav.favoriteId}`}
                  favorite={fav}
                />
              ))}
            </div>
          )}
        </>
      )}

      {activeTab === 'watched' && (
        <>
          <SectionHeading title="Watched" />
          {watchedTitles.length === 0 ? (
            <EmptyState
              icon={Eye}
              title="No watched titles yet"
              description="Tap Mark as Watched on a title or finish an item in a watchlist — your watched list lives here."
              action={
                <Link href="/for-you">
                  <Button className="gap-2">
                    <Search className="w-4 h-4" />
                    Find something to watch
                  </Button>
                </Link>
              }
            />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {watchedTitles.map((w) => (
                <WatchedCard
                  key={`${w.mediaType}-${w.mediaId}`}
                  entry={w}
                  onUnwatch={handleUnwatch}
                  pending={
                    unwatchPendingKey === `${w.mediaType}:${w.mediaId}`
                  }
                />
              ))}
            </div>
          )}
        </>
      )}

      {activeTab === 'reviews' && (
        <>
          <SectionHeading title="Reviews" />
          {reviewsLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="flex gap-3 rounded-lg border border-border/40 bg-card p-3"
                  aria-hidden="true"
                >
                  <div className="w-16 shrink-0 aspect-2/3 rounded-md bg-muted animate-pulse" />
                  <div className="flex-1 flex flex-col gap-2 pt-1">
                    <div className="h-4 w-2/3 rounded bg-muted animate-pulse" />
                    <div className="h-3 w-24 rounded bg-muted animate-pulse" />
                    <div className="h-3 w-full rounded bg-muted animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          ) : reviewsError ? (
            <ErrorState
              title="Couldn't load your reviews"
              description="Something went wrong. Please try again."
              action={
                <Button
                  variant="secondary"
                  onClick={() => {
                    reviewsRequested.current = false;
                    loadReviews();
                  }}
                >
                  Try again
                </Button>
              }
            />
          ) : !reviews || reviews.length === 0 ? (
            <EmptyState
              icon={Star}
              title="No reviews yet"
              description="Rate and review titles from their detail page — your reviews collect here."
              action={
                <Link href="/search">
                  <Button className="gap-2">
                    <Search className="w-4 h-4" />
                    Find something to watch
                  </Button>
                </Link>
              }
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {reviews.map((r) => (
                <ReviewCard key={`${r.titleType}:${r.titleId}`} review={r} />
              ))}
            </div>
          )}
        </>
      )}

      {activeTab === 'activity' && (
        <>
          <SectionHeading
            title="Recent activity"
            href={recentActivity.length > 0 ? '/activity' : undefined}
          />
          {recentActivity.length === 0 ? (
            <EmptyState
              icon={ActivityIcon}
              title="No recent activity yet"
              description="Likes, favorites, and watchlist changes will show up here."
              action={
                <Link href="/search">
                  <Button className="gap-2">
                    <Search className="w-4 h-4" />
                    Find something to watch
                  </Button>
                </Link>
              }
            />
          ) : (
            <Card>
              <CardContent className="px-5 sm:px-8 py-2 divide-y divide-border/40">
                {recentActivity.map((item) => (
                  <ActivityRow key={item.id} item={item} />
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}

      {activeTab === 'followers' && (
        <>
          <SectionHeading title="Followers" />
          <FollowListTabPanel
            loader={listMyFollowersAction}
            emptyTitle="No followers yet"
            emptyDescription="When people follow you, they'll show up here."
          />
        </>
      )}

      {activeTab === 'following' && (
        <>
          <SectionHeading title="Following" />
          <FollowListTabPanel
            loader={listMyFollowingAction}
            emptyTitle="Not following anyone yet"
            emptyDescription="Find users from the suggestions row or via search to start following."
          />
        </>
      )}

      <ProfileEditModal
        isOpen={isEditOpen}
        onClose={() => setEditOpen(false)}
        initial={{
          displayName: profile.displayName,
          bio: profile.bio,
          avatarUrl: profile.avatarUrl,
          accentColor: profile.accentColor,
          firstName: profile.firstName,
          lastName: profile.lastName,
        }}
        onSubmit={handleSubmit}
      />
    </>
  );
}

function SectionHeading({ title, href }: { title: string; href?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 mt-4">
      <h2 className="text-h3">{title}</h2>
      {href && (
        <Link
          href={href}
          className="text-sm text-muted-foreground hover:text-primary transition-colors inline-flex items-center gap-1"
        >
          View all
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overview sections (right column of the two-column dashboard)
// ---------------------------------------------------------------------------

interface OverviewSectionsProps {
  recentWatchlists: ProfileOverview['recentWatchlists'];
  recentFavorites: ProfileOverview['recentFavorites'];
  recentActivity: ProfileOverview['recentActivity'];
  watchlistsCount: number;
  favoritesCount: number;
}

function OverviewSections({
  recentWatchlists,
  recentFavorites,
  recentActivity,
  watchlistsCount,
  favoritesCount,
}: OverviewSectionsProps) {
  return (
    <>
      <div>
        <SectionHeading
          title="Watchlists"
          href={watchlistsCount > 0 ? '/watchlists' : undefined}
        />
        {recentWatchlists.length === 0 ? (
          <EmptyState
            icon={Bookmark}
            title="No watchlists yet"
            description="Group titles you want to watch into lists you can share or keep private."
            action={
              <Link href="/watchlists">
                <Button className="gap-2">
                  <Bookmark className="w-4 h-4" />
                  Open watchlists
                </Button>
              </Link>
            }
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
            {recentWatchlists.map((w) => (
              <WatchlistCard key={w.id} watchlist={w} />
            ))}
          </div>
        )}
      </div>

      <div>
        <SectionHeading
          title="Favorites"
          href={favoritesCount > 0 ? '/favorites' : undefined}
        />
        {recentFavorites.length === 0 ? (
          <EmptyState
            icon={Heart}
            title="No favorites yet"
            description="Tap the heart on any title, collection, or artist to start your favorites."
            action={
              <Link href="/search">
                <Button className="gap-2">
                  <Search className="w-4 h-4" />
                  Find something to watch
                </Button>
              </Link>
            }
          />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 mt-3">
            {recentFavorites.map((fav) => (
              <FavoriteCard
                key={`${fav.type}-${fav.favoriteId}`}
                favorite={fav}
              />
            ))}
          </div>
        )}
      </div>

      <div>
        <SectionHeading
          title="Recent activity"
          href={recentActivity.length > 0 ? '/activity' : undefined}
        />
        {recentActivity.length === 0 ? (
          <EmptyState
            icon={ActivityIcon}
            title="No recent activity yet"
            description="Likes, favorites, and watchlist changes will show up here."
            action={
              <Link href="/search">
                <Button className="gap-2">
                  <Search className="w-4 h-4" />
                  Find something to watch
                </Button>
              </Link>
            }
          />
        ) : (
          <Card>
            <CardContent className="px-5 sm:px-8 py-2 divide-y divide-border/40">
              {recentActivity.map((item) => (
                <ActivityRow key={item.id} item={item} />
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
