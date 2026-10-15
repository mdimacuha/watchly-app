import {
  PosterCardSkeleton,
  SkeletonBox,
} from '@/components/watchly/skeletons';

export default function CollectionLoading() {
  return (
    <div className="relative w-full min-h-screen bg-background">
      <SkeletonBox className="h-56 md:h-72 w-full rounded-none" />

      <div className="px-8 max-w-7xl mx-auto w-full flex flex-col gap-8 py-8">
        <div className="flex flex-col gap-3">
          <SkeletonBox className="h-9 w-2/3 max-w-xl" />
          <SkeletonBox className="h-4 w-full max-w-3xl" />
          <SkeletonBox className="h-4 w-3/4 max-w-2xl" />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <PosterCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}
