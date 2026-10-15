import {
  PageHeaderSkeleton,
  SkeletonBox,
  PosterCardSkeleton,
} from '@/components/watchly/skeletons';

export default function MeLoading() {
  return (
    <div className="px-8 py-10 flex flex-col gap-6 max-w-5xl mx-auto w-full">
      <PageHeaderSkeleton />

      {/* Profile card (header + stats row). */}
      <div className="rounded-xl border border-border bg-card p-6 flex flex-col gap-4">
        <div className="flex items-start gap-5">
          <SkeletonBox className="h-20 w-20 rounded-full shrink-0" />
          <div className="flex-1 flex flex-col gap-2">
            <SkeletonBox className="h-6 w-1/3" />
            <SkeletonBox className="h-4 w-1/4" />
            <SkeletonBox className="h-4 w-2/3 mt-2" />
          </div>
          <SkeletonBox className="h-9 w-20 shrink-0" />
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-3 pt-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonBox key={i} className="h-4 w-28" />
          ))}
        </div>
      </div>

      {/* Tabs strip. */}
      <div className="flex gap-6 border-b border-border">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonBox key={i} className="h-6 w-20 mb-2" />
        ))}
      </div>

      {/* Two-col Overview content. */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <PosterCardSkeleton key={i} />
          ))}
        </div>
        <aside className="flex flex-col gap-3">
          <SkeletonBox className="h-32 rounded-xl" />
          <SkeletonBox className="h-24 rounded-xl" />
        </aside>
      </div>
    </div>
  );
}
