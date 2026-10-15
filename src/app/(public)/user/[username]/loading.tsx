import {
  PosterCardSkeleton,
  SkeletonBox,
} from '@/components/watchly/skeletons';

export default function UserProfileLoading() {
  return (
    <div className="w-full">
      {/* Banner */}
      <SkeletonBox className="h-40 md:h-56 w-full rounded-none" />

      <div className="px-8 max-w-7xl mx-auto w-full flex flex-col gap-8 -mt-12">
        {/* Identity row */}
        <div className="flex items-end gap-4">
          <SkeletonBox className="h-24 w-24 rounded-full" />
          <div className="flex flex-col gap-2 pb-2">
            <SkeletonBox className="h-7 w-48" />
            <SkeletonBox className="h-4 w-32" />
          </div>
        </div>

        {/* Stats */}
        <div className="flex gap-8">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonBox key={i} className="h-12 w-20" />
          ))}
        </div>

        {/* Favorites grid */}
        <div className="flex flex-col gap-4">
          <SkeletonBox className="h-6 w-40" />
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <PosterCardSkeleton key={i} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
