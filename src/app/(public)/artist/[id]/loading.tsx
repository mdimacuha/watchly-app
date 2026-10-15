import {
  PosterCardSkeleton,
  SkeletonBox,
} from '@/components/watchly/skeletons';

export default function ArtistLoading() {
  return (
    <div className="relative w-full min-h-screen bg-background">
      <div className="px-8 max-w-7xl mx-auto w-full flex flex-col gap-8 py-10">
        {/* Header: profile photo + bio */}
        <div className="flex flex-col md:flex-row gap-8 items-start">
          <SkeletonBox className="w-full max-w-[280px] aspect-[2/3] rounded-lg" />
          <div className="flex-1 w-full flex flex-col gap-4">
            <SkeletonBox className="h-9 w-1/2" />
            <SkeletonBox className="h-4 w-32" />
            <div className="flex flex-col gap-2 pt-2 max-w-3xl">
              {Array.from({ length: 4 }).map((_, i) => (
                <SkeletonBox key={i} className="h-4 w-full" />
              ))}
            </div>
          </div>
        </div>

        {/* Known for grid */}
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
