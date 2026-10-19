import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { UserAvatar } from '@/components/ui/user-avatar';
import { ArrowStrip } from '@/components/ui/ArrowStrip';
import { FollowButton } from './FollowButton';
import type { PublicUserCard } from '@/services/social';

interface FollowSuggestionsRowProps {
  suggestions: PublicUserCard[];
  /** Omit the built-in heading (when the caller provides its own, e.g. a collapsible header). */
  hideHeading?: boolean;
}

/**
 * Horizontal scroller of accounts the user might want to follow. Each
 * card has avatar + name + a compact Follow button. Empty rows are
 * filtered out by the caller — we never render an empty row.
 */
export function FollowSuggestionsRow({
  suggestions,
  hideHeading = false,
}: FollowSuggestionsRowProps) {
  if (suggestions.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      {!hideHeading && (
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <h3 className="text-sm uppercase tracking-wider font-semibold text-muted-foreground">
            People you might know
          </h3>
        </div>
      )}
      <ArrowStrip label="suggested people">
      <div className="overflow-x-auto scrollbar-hover -mx-4 px-4 snap-x snap-mandatory">
        <div className="flex gap-3 min-w-max pb-2">
          {suggestions.map((u) => (
            <SuggestionCard key={u.id} user={u} />
          ))}
        </div>
      </div>
      </ArrowStrip>
    </section>
  );
}

function SuggestionCard({ user }: { user: PublicUserCard }) {
  const heading = user.displayName || user.username;
  return (
    <div className="w-[200px] shrink-0 snap-start flex flex-col items-center gap-2 p-4 rounded-lg border border-border bg-card">
      <Link href={`/user/${user.username}`} className="flex flex-col items-center gap-2">
        <UserAvatar
          avatarUrl={user.avatarUrl}
          firstName={user.firstName}
          lastName={user.lastName}
          size="lg"
          className="!w-16 !h-16"
        />
        <div className="text-center min-w-0 w-full">
          <p className="text-sm font-semibold text-foreground truncate">
            {heading}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            @{user.username}
          </p>
        </div>
      </Link>
      <FollowButton
        targetUserId={user.id}
        initialStatus={null}
        isSelf={false}
        size="sm"
        className="mt-1"
      />
    </div>
  );
}
