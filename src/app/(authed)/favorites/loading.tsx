import {
  PageHeaderSkeleton,
  PosterCardSkeleton,
  SkeletonBox,
} from '@/components/watchly/skeletons';

export default function FavoritesLoading() {
  return (
    <div className="px-8 py-10 max-w-7xl mx-auto w-full flex flex-col gap-6">
      <PageHeaderSkeleton />
      <SkeletonBox className="h-4 w-80 opacity-70" />

      <div className="flex gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonBox key={i} className="h-8 w-20 rounded-full" />
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
        {Array.from({ length: 12 }).map((_, i) => (
          <PosterCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
