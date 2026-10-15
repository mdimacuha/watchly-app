import {
  PageHeaderSkeleton,
  SkeletonBox,
} from '@/components/watchly/skeletons';

export default function WatchlistsLoading() {
  return (
    <div className="px-8 py-10 max-w-6xl mx-auto w-full flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <PageHeaderSkeleton />
        <SkeletonBox className="h-10 w-28" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-border bg-card overflow-hidden"
          >
            <SkeletonBox className="aspect-[16/9] w-full rounded-none" />
            <div className="p-4 flex flex-col gap-2">
              <SkeletonBox className="h-5 w-2/3" />
              <SkeletonBox className="h-3 w-1/3 opacity-70" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
