import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Bookmark, Heart, Eye, Calendar, User, ArrowRight, MapPin, Users } from 'lucide-react';
import { getCountryName } from '@/lib/regions/countries';
import { AccentScope } from '@/components/profile/AccentScope';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { UserAvatar } from '@/components/ui/user-avatar';
import { EmptyState } from '@/components/watchly/EmptyState';
import { WatchlistCard } from '@/components/watchlists/WatchlistCard';
import { FavoriteCard } from '@/components/favorites/FavoriteCard';
import { WatchedCard } from '@/components/watched/WatchedCard';
import { TasteProfile } from '@/components/profile/TasteProfile';
import { FollowButton } from '@/components/social/FollowButton';
import { ProfileMoreMenu } from '@/components/social/ProfileMoreMenu';
import { ProfileBanner } from '@/components/profile/ProfileBanner';
import { VerifiedBadge } from '@/components/profile/VerifiedBadge';
import { BackLink } from '@/components/nav/BackLink';
import { isVerifiedAccount } from '@/constants/verifiedAccounts';
import { getProfileShowcaseAction, getPublicProfileAction } from '@/actions/profile';
import { ProfilePrototype } from '@/components/profile/ProfilePrototype';

interface PageProps {
  params: Promise<{ username: string }>;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  // Deliberately fetch-free: profiles are noindex (privacy + thin-content
  // safety), so we only need a clean share preview, not indexable copy. The
  // heavy getPublicProfileAction stays on the page render.
  return {
    title: `@${username}`,
    description: `See @${username}'s public watchlists, favorites, and taste in movies & TV on Watchly.`,
    alternates: { canonical: `/user/${username}` },
    // Shareable (OG unfurls regardless of robots) but kept out of the index.
    robots: { index: false, follow: true },
    openGraph: {
      type: 'profile',
      title: `@${username} on Watchly`,
      description: `Public watchlists, favorites, and taste from @${username}.`,
      url: `/user/${username}`,
    },
    twitter: {
      card: 'summary_large_image',
      title: `@${username} on Watchly`,
      description: `Public watchlists, favorites, and taste from @${username}.`,
    },
  };
}

function formatMemberSince(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long' });
}

export default async function UserProfilePage({ params }: PageProps) {
  const { username } = await params;

  // PROTOTYPE: profile redesign (?variant=a|b|c), dev builds only — the
  // visitor view, incl. taste match when signed in.
  if (process.env.NODE_ENV !== 'production') {
    let showcase;
    try {
      showcase = await getProfileShowcaseAction(username);
    } catch {
      notFound();
    }
    return (
      <AccentScope
        accentColor={showcase.overview.profile.accentColor}
        className="px-4 sm:px-8 py-10 max-w-5xl mx-auto w-full"
      >
        <ProfilePrototype showcase={showcase} preview={false} />
      </AccentScope>
    );
  }

  let payload;
  try {
    payload = await getPublicProfileAction(username);
  } catch {
    notFound();
  }

  const {
    profile,
    publicWatchlists,
    recentFavorites,
    favoritesHidden,
    watchedHidden,
    watchedTitles,
    tasteProfile,
    isSelf,
    followState,
    followSummary,
    mutualFollowers,
    bannerPosters,
  } = payload;
  const heading =
    profile.displayName ||
    `${profile.firstName} ${profile.lastName}`.trim() ||
    profile.username;

  return (
    <AccentScope
      accentColor={profile.accentColor}
      className="px-8 py-10 flex flex-col gap-6 max-w-5xl mx-auto w-full"
    >
      <BackLink fallbackHref="/for-you" />

      <div className="flex items-center gap-3">
        <User size={24} className="text-primary" />
        <h1 className="text-h2 inline-flex items-center gap-1.5">
          @{profile.username}
          {isVerifiedAccount(profile.username) && (
            <VerifiedBadge size="md" />
          )}
        </h1>
        {isSelf && (
          <span className="text-xs text-muted-foreground">(this is you)</span>
        )}
      </div>

      <div className="flex flex-col">
        {profile.bannerEnabled && bannerPosters.length > 0 && (
          <ProfileBanner posters={bannerPosters} />
        )}

        <Card
          className={
            profile.bannerEnabled && bannerPosters.length > 0
              ? 'rounded-t-none border-t-0'
              : undefined
          }
        >
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
            <span className="text-sm text-muted-foreground">@{profile.username}</span>
            {profile.bio && (
              <p className="text-sm text-foreground/90 mt-2 max-w-2xl whitespace-pre-line">
                {profile.bio}
              </p>
            )}
          </div>
          {/* Social actions — Follow button + 3-dot menu (Block). Hidden
              when viewing your own profile. */}
          {!isSelf && (
            <div className="flex items-center gap-2 shrink-0">
              <FollowButton
                targetUserId={profile.userId}
                initialStatus={followState.status}
                isSelf={isSelf}
                blocked={followState.blocked}
              />
              <ProfileMoreMenu
                targetUserId={profile.userId}
                targetUsername={profile.username}
                isBlocked={followState.blocked}
              />
            </div>
          )}
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
            <Link
              href={`/user/${profile.username}/followers`}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <Users className="w-4 h-4 text-primary" />
              <strong className="text-foreground">
                {followSummary.followersCount}
              </strong>{' '}
              followers
            </Link>
            <Link
              href={`/user/${profile.username}/following`}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <Users className="w-4 h-4 text-primary" />
              <strong className="text-foreground">
                {followSummary.followingCount}
              </strong>{' '}
              following
            </Link>
            {!favoritesHidden && (
              <span className="flex items-center gap-2 text-muted-foreground">
                <Heart className="w-4 h-4 text-primary" />
                <strong className="text-foreground">
                  {profile.stats.favoritesCount}
                </strong>{' '}
                favorites
              </span>
            )}
            <span className="flex items-center gap-2 text-muted-foreground">
              <Bookmark className="w-4 h-4 text-primary" />
              <strong className="text-foreground">
                {profile.stats.watchlistsCount}
              </strong>{' '}
              watchlists
            </span>
            {!watchedHidden && (
              <span className="flex items-center gap-2 text-muted-foreground">
                <Eye className="w-4 h-4 text-primary" />
                <strong className="text-foreground">
                  {profile.stats.watchedCount}
                </strong>{' '}
                watched
              </span>
            )}
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

          {/* Mutual followers line — "Followed by X, Y, and N others". */}
          {!isSelf && mutualFollowers.totalCount > 0 && (
            <p className="text-xs text-muted-foreground mt-3">
              Followed by{' '}
              {mutualFollowers.users.map((u, i) => (
                <span key={u.id}>
                  <Link
                    href={`/user/${u.username}`}
                    className="text-foreground hover:text-primary transition-colors"
                  >
                    {u.displayName || u.username}
                  </Link>
                  {i < mutualFollowers.users.length - 1 ? ', ' : ''}
                </span>
              ))}
              {mutualFollowers.totalCount > mutualFollowers.users.length && (
                <>
                  {' '}
                  and{' '}
                  {mutualFollowers.totalCount - mutualFollowers.users.length}{' '}
                  others
                </>
              )}
            </p>
          )}
        </CardContent>
      </Card>
      </div>

      <div className="flex items-center justify-between gap-3 mt-4">
        <h2 className="text-h3">Public watchlists</h2>
      </div>
      {publicWatchlists.length === 0 ? (
        <EmptyState
          icon={Bookmark}
          title="No public watchlists"
          description={
            isSelf
              ? 'Toggle one of your watchlists to public from its detail page.'
              : `@${profile.username} hasn't shared any watchlists yet.`
          }
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {publicWatchlists.map((w) => (
            <WatchlistCard key={w.id} watchlist={w} quickLook />
          ))}
        </div>
      )}

      {favoritesHidden ? null : (
        <>
          <div className="flex items-center justify-between gap-3 mt-4">
            <h2 className="text-h3">Favorites</h2>
            {isSelf && profile.stats.favoritesCount > 0 && (
              <Link
                href="/favorites"
                className="text-sm text-muted-foreground hover:text-primary transition-colors inline-flex items-center gap-1"
              >
                View all
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            )}
          </div>
          {recentFavorites.length === 0 ? (
            <EmptyState
              icon={Heart}
              title="No favorites yet"
              description={
                isSelf
                  ? 'Tap the heart on any title to add it to your favorites.'
                  : `@${profile.username} hasn't favorited anything yet.`
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

      {/* Watched section — owner always sees it (so they can verify the
          privacy toggle worked); visitors only see it when the owner has
          opted into sharing (hideWatched=false). */}
      {watchedHidden ? null : (
        <>
          <div className="flex items-center justify-between gap-3 mt-4">
            <h2 className="text-h3">Watched</h2>
          </div>
          {watchedTitles.length === 0 ? (
            <EmptyState
              icon={Eye}
              title="No watched titles yet"
              description={
                isSelf
                  ? 'Mark a title as watched from For You or finish one in a watchlist — it will show up here.'
                  : `@${profile.username} hasn't marked anything as watched yet.`
              }
            />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {watchedTitles.map((w) => (
                <WatchedCard
                  key={`${w.mediaType}-${w.mediaId}`}
                  entry={w}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Taste summary at the bottom — present unless the user has zero data. */}
      {(tasteProfile.genres.length > 0 || tasteProfile.decades.length > 0) && (
        <div className="mt-4">
          <TasteProfile taste={tasteProfile} isSelf={isSelf} />
        </div>
      )}
    </AccentScope>
  );
}
