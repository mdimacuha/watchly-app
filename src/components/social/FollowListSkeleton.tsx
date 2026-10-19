import { SkeletonBox } from '@/components/watchly/skeletons';

/**
 * Loading state for /user/[username]/followers and /following, shaped like
 * FollowListView (owner row, switch, search, person cards) — without it the
 * parent profile's banner skeleton showed while the list loaded.
 */
export function FollowListSkeleton() {
  return (
    <div className="px-4 sm:px-8 py-10 max-w-4xl mx-auto w-full flex flex-col gap-6" aria-busy="true">
      <SkeletonBox className="h-5 w-36" />
      <div className="flex items-center gap-3">
        <SkeletonBox className="h-14 w-14 rounded-full" />
        <div className="flex flex-col gap-2">
          <SkeletonBox className="h-6 w-44" />
          <SkeletonBox className="h-4 w-24" />
        </div>
      </div>
      <SkeletonBox className="h-10 w-60 rounded-lg" />
      <SkeletonBox className="h-10 w-full sm:max-w-xs" />
      <ul className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <li key={i}>
            <SkeletonBox className="h-[76px] w-full rounded-xl" />
          </li>
        ))}
      </ul>
    </div>
  );
}
